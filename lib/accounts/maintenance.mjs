// Only operates on the new account database and its private objects.
export async function maintainAccounts({ db, files, now = Date.now() }) {
  const date = new Date(now).toISOString(),
    dayAgo = new Date(now - 86400000).toISOString(),
    trashCutoff = new Date(now - 30 * 86400000).toISOString(),
    receiptCutoff = new Date(now - 7 * 86400000).toISOString();
  const owners = await db.identity(async (tx) => {
    await tx.query(
      "UPDATE qinban_identity.users SET state='deleting' WHERE state='deletion_pending' AND delete_after<=$1",
      [date],
    );
    await tx.query(
      "DELETE FROM qinban_identity.challenges WHERE expires_at<$1",
      [dayAgo],
    );
    await tx.query("DELETE FROM qinban_identity.rate_limits WHERE bucket<$1", [
      Math.floor(now / 900000) - 192,
    ]);
    return (await tx.query("SELECT id,email,state FROM qinban_identity.users"))
      .rows;
  });
  const counts = {
    accountsPurged: 0,
    entriesPurged: 0,
    resourcesPurged: 0,
    orphansPurged: 0,
  };
  for (const user of owners) {
    if (user.state === "deleting") {
      await db.control(async (tx) => {
        await tx.query(
          "UPDATE qinban_control.job_index SET cancel_requested=true,state='cancelled' WHERE owner_id=$1 AND state IN ('queued','running')",
          [user.id],
        );
        await tx.query(
          "DELETE FROM qinban_control.feedback_index WHERE owner_id=$1",
          [user.id],
        );
      });
      await files.purgeOwner(user.id);
      await db.private(user.id, async (tx) => {
        for (const table of [
          "recognition_jobs",
          "feedback",
          "entries",
          "group_resources",
          "source_groups",
          "uploads",
          "resources",
          "operations",
          "receipts",
          "audit",
        ])
          await tx.query(
            `DELETE FROM qinban_private.${table} WHERE owner_id=$1`,
            [user.id],
          );
      });
      await db.identity(async (tx) => {
        const claimed = (
          await tx.query(
            "SELECT id FROM qinban_identity.users WHERE id=$1 AND state='deleting' FOR UPDATE",
            [user.id],
          )
        ).rows[0];
        if (!claimed) return;
        await tx.query(
          "DELETE FROM qinban_identity.sessions WHERE user_id=$1",
          [user.id],
        );
        await tx.query(
          "DELETE FROM qinban_identity.challenges WHERE email=$1",
          [user.email],
        );
        await tx.query(
          "DELETE FROM qinban_identity.invitations WHERE email=$1",
          [user.email],
        );
        await tx.query("DELETE FROM qinban_identity.users WHERE id=$1", [
          user.id,
        ]);
      });
      counts.accountsPurged++;
      continue;
    }
    const resources = await db.private(user.id, async (tx) => {
      await tx.query(
        "DELETE FROM qinban_private.recognition_jobs j WHERE owner_id=$1 AND created_at<$2 AND NOT EXISTS(SELECT 1 FROM qinban_control.job_index i WHERE i.id=j.id AND i.state IN ('queued','running'))",
        [user.id, new Date(now - 60 * 86400000).toISOString()],
      );
      const removed = await tx.query(
        "DELETE FROM qinban_private.entries WHERE owner_id=$1 AND deleted_at<$2 RETURNING id",
        [user.id, trashCutoff],
      );
      counts.entriesPurged += removed.rows.length;
      await tx.query(
        "DELETE FROM qinban_private.operations WHERE owner_id=$1 AND expires_at<$2",
        [user.id, date],
      );
      await tx.query(
        "DELETE FROM qinban_private.receipts WHERE owner_id=$1 AND created_at<$2",
        [user.id, receiptCutoff],
      );
      await tx.query(
        "DELETE FROM qinban_private.uploads WHERE owner_id=$1 AND expires_at<$2",
        [user.id, date],
      );
      await tx.query(
        "DELETE FROM qinban_private.source_groups g WHERE owner_id=$1 AND pinned=false AND created_at<$2 AND NOT EXISTS(SELECT 1 FROM qinban_private.revision_sources s WHERE s.owner_id=$1 AND s.group_id=g.id) AND NOT EXISTS(SELECT 1 FROM qinban_private.recognition_jobs j WHERE j.owner_id=$1 AND j.source_group_id=g.id)",
        [user.id, dayAgo],
      );
      return (
        await tx.query(
          "SELECT id FROM qinban_private.resources r WHERE owner_id=$1 AND (created_at<$2 OR (metadata->>'backup'='true' AND (metadata->>'expiresAt')::timestamptz<$3)) AND NOT EXISTS(SELECT 1 FROM qinban_private.revision_resources v WHERE v.owner_id=$1 AND v.resource_id=r.id) AND NOT EXISTS(SELECT 1 FROM qinban_private.group_resources g WHERE g.owner_id=$1 AND g.resource_id=r.id) AND NOT EXISTS(SELECT 1 FROM qinban_private.uploads u WHERE u.owner_id=$1 AND u.resource_id=r.id) AND NOT EXISTS(SELECT 1 FROM qinban_private.job_resources jr WHERE jr.owner_id=$1 AND jr.resource_id=r.id)",
          [user.id, dayAgo, date],
        )
      ).rows;
    });
    // Recheck references while deleting, under the same owner's quota lock as finalization.
    for (const r of resources)
      await db.private(user.id, async (tx) => {
        await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          user.id + ":quota",
        ]);
        const referenced = await tx.query(
          "SELECT 1 FROM qinban_private.revision_resources WHERE owner_id=$1 AND resource_id=$2 UNION ALL SELECT 1 FROM qinban_private.group_resources WHERE owner_id=$1 AND resource_id=$2 UNION ALL SELECT 1 FROM qinban_private.job_resources WHERE owner_id=$1 AND resource_id=$2 UNION ALL SELECT 1 FROM qinban_private.uploads WHERE owner_id=$1 AND resource_id=$2 UNION ALL SELECT 1 FROM qinban_private.resources WHERE owner_id=$1 AND metadata->>'recognitionResourceId'=$2::text",
          [user.id, r.id],
        );
        if (referenced.rows.length) return;
        await files.remove(user.id, r.id);
        await tx.query(
          "DELETE FROM qinban_private.resources WHERE owner_id=$1 AND id=$2",
          [user.id, r.id],
        );
        counts.resourcesPurged++;
      });
    // A failed database commit may leave an object after its atomic file rename.
    // Give it a day, then recheck under the writer's lock before reclaiming it.
    for (const object of await files.objects(user.id))
      if (object.modifiedAt < now - 86400000)
        await db.private(user.id, async (tx) => {
          await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
            user.id + ":quota",
          ]);
          if (
            (
              await tx.query(
                "SELECT 1 FROM qinban_private.resources WHERE owner_id=$1 AND id=$2",
                [user.id, object.id],
              )
            ).rows.length
          )
            return;
          await files.remove(user.id, object.id);
          counts.orphansPurged++;
        });
  }
  return counts;
}
