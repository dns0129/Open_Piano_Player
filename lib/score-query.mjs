/** Known work names only translate a query; they never fabricate a score or a result. */
export const scoreWorks = [
  { title:'Flight of the Bumblebee', creator:'Rimsky-Korsakov', aliases:['野蜂飞舞','野蜂飛舞','Flight of the Bumblebee','Flight of the Bumble Bee','The Flight of the Bumblebee','Hummelflug','Le vol du bourdon','Полёт шмеля','Полет шмеля'], creatorAliases:['Rimsky-Korsakov','Rimsky Korsakov','里姆斯基-科萨科夫','里姆斯基科萨科夫','林姆斯基-高沙可夫'] },
  { title:'Canon in D', creator:'Pachelbel', aliases:['卡农','卡農','Canon in D'], creatorAliases:['Pachelbel','帕赫贝尔','帕海贝尔'] },
  { title:'Fur Elise', creator:'Beethoven', aliases:['致爱丽丝','致愛麗絲','Fur Elise','Für Elise'], creatorAliases:['Beethoven','贝多芬','貝多芬'] },
  { title:'Ode to Joy', creator:'Beethoven', aliases:['欢乐颂','歡樂頌','Ode to Joy'], creatorAliases:['Beethoven','贝多芬','貝多芬'] },
  { title:'Moonlight Sonata', creator:'Beethoven', aliases:['月光奏鸣曲','月光奏鳴曲','Moonlight Sonata'], creatorAliases:['Beethoven','贝多芬','貝多芬'] },
  { title:'Swan Lake', creator:'Tchaikovsky', aliases:['天鹅湖','天鵝湖','Swan Lake'], creatorAliases:['Tchaikovsky','柴可夫斯基'] },
  { title:'Turkish March', creator:'Mozart', aliases:['土耳其进行曲','土耳其進行曲','Turkish March','Rondo alla Turca'], creatorAliases:['Mozart','莫扎特'] },
  { title:'Hungarian Rhapsody No. 2', creator:'Liszt', aliases:['匈牙利狂想曲第二号','匈牙利狂想曲第2号','Hungarian Rhapsody No. 2'], creatorAliases:['Liszt','李斯特'] },
  { title:'Gymnopedie No. 1', creator:'Satie', aliases:['第一号裸体舞曲','裸体舞曲第一号','Gymnopedie No. 1','Gymnopédie No. 1'], creatorAliases:['Satie','萨蒂'] },
  { title:'The Entertainer', creator:'Joplin', aliases:['演艺人','演藝人','The Entertainer'], creatorAliases:['Joplin','乔普林'] },
];
export const normalizeScoreText = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'');
export const stripScoreTerms = value => String(value || '').normalize('NFKC').replace(/(?:钢琴谱|鋼琴譜|五线谱|五線譜|简谱|簡譜|琴谱|琴譜|双手|雙手|钢琴|鋼琴|乐谱|樂譜)/gi,' ').replace(/\b(?:sheet\s*music|piano\s*score|musicxml|midi|pdf)\b/gi,' ').replace(/[《》“”"]/g,' ').replace(/\s+/g,' ').trim();
export function workAliasFor(query) {
  const normalized = normalizeScoreText(stripScoreTerms(query));
  return scoreWorks.find(work => work.aliases.some(alias => normalized.includes(normalizeScoreText(alias)))) || null;
}
export function getScoreQueryPlan(query) {
  const original = String(query || '').trim(), cleaned=stripScoreTerms(original), matchedWork=workAliasFor(cleaned);
  let translated=cleaned;
  if(matchedWork){
    const alias=[...matchedWork.aliases].sort((a,b)=>b.length-a.length).find(value => normalizeScoreText(cleaned).includes(normalizeScoreText(value)));
    // Match literal aliases while tolerating diacritics/case; retain extra artist/version words.
    const tokens=cleaned.split(/\s+/); let replaced=false;
    for(let start=0;start<tokens.length&&!replaced;start++)for(let end=tokens.length;end>start;end--){
      if(normalizeScoreText(tokens.slice(start,end).join(' '))===normalizeScoreText(alias)){
        tokens.splice(start,end-start,matchedWork.title);replaced=true;break;
      }
    }
    translated=replaced?tokens.join(' '):matchedWork.title+' '+cleaned;
    for(const creatorAlias of matchedWork.creatorAliases)translated=translated.replaceAll(creatorAlias,matchedWork.creator);
  }
  const originals=original+(/[\u3400-\u9fff]/.test(original)?' 钢琴谱':' piano sheet music');
  const english=translated+' piano solo sheet music'+(matchedWork&&!normalizeScoreText(translated).includes(normalizeScoreText(matchedWork.creator))?' '+matchedWork.creator:'');
  const queries=[...new Set(matchedWork?[english,originals]:[originals])];
  return {original,normalizedOriginal:normalizeScoreText(original),matchedWork,queries,aliases:matchedWork?.aliases || []};
}
