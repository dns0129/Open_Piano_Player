import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
const root = ".local/omr-benchmark-20261017",
  tree = JSON.parse(await readFile(root + "/source-tree.json"));
const selected = [
  ["01-minuet", "G大调小步舞曲", "Bach_Minuet_in_G_Major_BWV_Anh._114.mxl"],
  [
    "02-greensleeves",
    "绿袖子 · 简易钢琴版",
    "Greensleeves_for_Piano_easy_and_beautiful.mxl",
  ],
  [
    "03-birthday",
    "生日快乐 · C大调钢琴版",
    "Happy_Birthday_To_You_C_Major.mxl",
  ],
  ["04-ode", "欢乐颂 · 简易变奏", "Ode_to_Joy_Easy_variation.mxl"],
  ["05-elise", "致爱丽丝 · 简易钢琴版", "Fur_Elise_Easy_Piano.mxl"],
  ["06-gymnopedie", "第一号裸体舞曲", "Gymnopdie_No._1__Satie.mxl"],
  [
    "07-bach-prelude",
    "C大调前奏曲 BWV846",
    "Prelude_I_in_C_major_BWV_846_-_Well_Tempered_Clavier_First_Book.mxl",
  ],
  [
    "08-chopin-prelude",
    "E小调前奏曲 Op.28 No.4",
    "Prlude_No._4_in_E_Minor_Op._28_-_Frdric_Chopin.mxl",
  ],
  ["09-village-dance", "乡村舞曲", "DANSE_VILLAGEOISE_Beethoven.mxl"],
  ["10-waltz", "A小调圆舞曲", "Waltz_in_A_MinorChopin.mxl"],
];
const out = [];
for (const [id, title, name] of selected) {
  const path = "scores/" + name;
  if (!tree.tree.some((x) => x.path === path)) throw Error("Unknown source");
  const folder = root + "/" + id;
  await mkdir(folder, { recursive: true });
  const url = `https://raw.githubusercontent.com/musetrainer/library/${tree.sha}/${path}`,
    res = await fetch(url);
  if (!res.ok) throw Error(id + " HTTP " + res.status);
  const bytes = Buffer.from(await res.arrayBuffer());
  await writeFile(folder + "/source.mxl", bytes);
  out.push({
    id,
    title,
    sourceUrl: `https://github.com/musetrainer/library/blob/${tree.sha}/${path}`,
    downloadUrl: url,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    license: "Repository states Public Domain; source attribution retained",
    repositoryCommit: tree.sha,
  });
  console.log(id, bytes.length);
}
await writeFile(root + "/corpus-sources.json", JSON.stringify(out, null, 2));
