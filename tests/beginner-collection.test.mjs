import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import MidiPackage from "@tonejs/midi/build/Midi.js";
import { validateCloudBundle } from "../lib/cloud-library-format.mjs";
import { createPerformanceTimeline } from "../lib/score-representations.ts";
import { KEY_NAMES, scoreKeySignature } from "../lib/score.mjs";
import { unzipSync } from "fflate";

for (const collection of ["beginner", "intermediate"])
  test(
    collection +
      " collection retains licensed originals and every MIDI performance event",
    async () => {
      const manifest = JSON.parse(
        await readFile(
          new URL(
            "../score-repo/" + collection + "-sources.json",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      assert.equal(manifest.scores.length, 20);
      assert.equal(new Set(manifest.scores.map((s) => s.id)).size, 20);
      assert.equal(
        manifest.scores.filter(
          (s) => s.batch === (collection === "beginner" ? 2 : 3),
        ).length,
        collection === "beginner" ? 10 : 20,
      );
      for (const source of manifest.scores) {
        const files = {};
        for (const [kind, file] of Object.entries(source.files)) {
          const bytes = await readFile(
            new URL("../" + file.path, import.meta.url),
          );
          files[kind] = bytes;
          assert.equal(
            createHash("sha256").update(bytes).digest("hex"),
            file.sha256,
          );
        }
        if (files.midiZip)
          assert.deepEqual(
            Buffer.from(
              unzipSync(files.midiZip)[source.files.mid.archiveMember],
            ),
            files.mid,
            source.id + " selected movement",
          );
        const bundle = validateCloudBundle(
          JSON.parse(
            await readFile(
              new URL(
                "../public/cloud-library/scores/" + source.id + ".json",
                import.meta.url,
              ),
              "utf8",
            ),
          ),
        );
        assert.ok(bundle.score.source.license.includes(source.license));
        assert.ok(bundle.score.source.license.includes(source.maintainer));
        const midi = new MidiPackage.Midi(files.mid),
          timeline = createPerformanceTimeline(bundle.document),
          expected = [];
        if (source.pickupBeats)
          assert.equal(
            bundle.document.measureMap[0].duration,
            source.pickupBeats,
          );
        if (source.keySignature !== undefined)
          assert.equal(bundle.document.keySignature, source.keySignature);
        if (source.mode) assert.equal(bundle.document.mode, source.mode);
        for (const change of midi.header.keySignatures.filter(
          (e) => e.ticks > 0,
        )) {
          const beat = change.ticks / midi.header.ppq;
          if (beat >= bundle.document.durationBeats) continue;
          const i = bundle.document.measureMap.findLastIndex(
            (m) => m.beat <= beat + 1e-7,
          );
          assert.equal(
            scoreKeySignature(bundle.document, i),
            KEY_NAMES.indexOf(change.key) - 7,
            source.id + " key at " + beat,
          );
        }
        for (const change of midi.header.timeSignatures) {
          const beat = change.ticks / midi.header.ppq;
          if (beat >= bundle.document.durationBeats) continue;
          const measure = bundle.document.measureMap
            .filter((m) => m.beat <= beat + 1e-7)
            .at(-1);
          assert.deepEqual(
            measure.timeSignature,
            change.timeSignature,
            source.id + " meter at " + beat,
          );
        }
        for (const [trackIndex, track] of midi.tracks.entries()) {
          if (!track.notes.length || track.channel === 9) continue;
          for (const note of track.notes) {
            expected.push({
              midi: note.midi,
              beat: note.ticks / midi.header.ppq,
              duration: note.durationTicks / midi.header.ppq,
              velocity: note.velocity,
              hand:
                source.trackHands?.[trackIndex] ||
                (/upper|^up:/i.test(track.name) ? "right" : "left"),
            });
          }
        }
        const order = (a, b) =>
          a.beat - b.beat ||
          a.midi - b.midi ||
          a.duration - b.duration ||
          a.hand.localeCompare(b.hand);
        expected.sort(order);
        const actual = timeline.notes.toSorted(order);
        assert.equal(actual.length, expected.length, source.id);
        for (let i = 0; i < expected.length; i++) {
          assert.equal(actual[i].midi, expected[i].midi);
          assert.equal(actual[i].hand, expected[i].hand);
          assert.equal(actual[i].velocity, expected[i].velocity);
          assert.ok(Math.abs(actual[i].beat - expected[i].beat) < 1e-6);
          assert.ok(Math.abs(actual[i].duration - expected[i].duration) < 1e-6);
        }
        assert.ok(timeline.durationSeconds > 0);
        assert.ok(bundle.document.migration.inferred.includes("pitch"));
      }
    },
  );
