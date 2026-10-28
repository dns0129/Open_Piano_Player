// Read-only browser geometry checks shared by the local responsive fixture.
// Intentional modal backdrops and the mobile settings dialog are excluded.
export function inspectFrontendLayout(doc) {
  const view=doc.defaultView,issues=[],checked=[];
  const visible=el=>el&&el.getClientRects().length&&view.getComputedStyle(el).visibility!=='hidden';
  const name=el=>el.id?`#${el.id}`:'.'+String(el.className).trim().split(/\s+/).join('.');
  const rect=el=>el.getBoundingClientRect();
  const overlaps=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>2&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>2;
  function group(label,elements){
    elements=elements.filter(visible).filter(el=>el.getAttribute('role')!=='dialog');
    if(elements.length<2)return;
    checked.push(label);
    for(let i=0;i<elements.length;i++)for(let j=i+1;j<elements.length;j++)if(overlaps(rect(elements[i]),rect(elements[j])))issues.push({kind:'overlap',group:label,a:name(elements[i]),b:name(elements[j])});
  }
  for(const selector of ['.app-shell','.app-header','.practice-layout-bar','.score-document-heading','.playback-dock','.modal','.fsi-workspace','.discovery-content','.discovery-boards','.discovery-search-field','.commerce-header','.commerce-shell','.commerce-card','.commerce-grid','.commerce-hero','.commerce-actions','.account-shell','.account-card','.account-heading','.account-record','.fsi-top','.fsi-meta','.fsi-footer']){
    for(const parent of doc.querySelectorAll(selector)){
      if(!visible(parent))continue;
      const children=[...parent.children].filter(el=>!el.matches('script,style,.sidebar-scrim'));
      group(selector,children);
      const p=rect(parent);
      for(const child of children.filter(visible)){
        const c=rect(child),style=view.getComputedStyle(parent);
        if(['auto','scroll','hidden','clip'].includes(style.overflowX))continue;
        if(c.left<p.left-2||c.right>p.right+2)issues.push({kind:'overflow',group:selector,child:name(child),by:Math.round(Math.max(p.left-c.left,c.right-p.right))});
      }
    }
  }
  const practice=doc.querySelector('.view-practice');
  if(practice)group('practice-panels',[...practice.children].filter(el=>el.matches('.practice-layout-bar,.practice-sidebar,.score-stage,.playback-dock,.practice-keyboard,.layout-restore')));
  const review=doc.querySelector('.full-score-import');
  if(review)group('review-panels',[...review.children].filter(el=>!el.matches('style')));
  if(doc.documentElement.scrollWidth>view.innerWidth+2)issues.push({kind:'viewport-overflow',by:doc.documentElement.scrollWidth-view.innerWidth});
  const bodyStyle=view.getComputedStyle(doc.body);
  if(doc.querySelector('.account-shell,.commerce-shell')&&bodyStyle.overflowY==='hidden'&&doc.body.scrollHeight>view.innerHeight+2)issues.push({kind:'unreachable-page-content'});
  return {pass:issues.length===0,width:view.innerWidth,height:view.innerHeight,checked:checked.length,issues};
}
