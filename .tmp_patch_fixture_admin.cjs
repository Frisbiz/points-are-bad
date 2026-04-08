const fs=require('fs');
const path='src/App.jsx';
let s=fs.readFileSync(path,'utf8');
const oldSave = `  const saveResult = async (fixtureId) => {
    const val = resultDraft[fixtureId];
    if (!val||!/^^\\d+-\\d+$$/.test(val)) return;
    await updateGroup(g=>{
      const fixture = (g.gameweeks||[]).flatMap(gw=>gw.fixtures).find(f=>f.id===fixtureId);
      const oldVal = fixture?.result||null;
      if (oldVal===val) return {...g,gameweeks:g.gameweeks.map(gw=>({...gw,fixtures:gw.fixtures.map(f=>f.id===fixtureId?{...f,result:val}:f)}))};
      const entry={id:Date.now(),at:Date.now(),by:user.username,action:"result",fixture:fixture?\`${'${fixture.home} vs ${fixture.away}'}\`:fixtureId,gw:currentGW,old:oldVal,new:val};
      return {...g,gameweeks:g.gameweeks.map(gw=>({...gw,fixtures:gw.fixtures.map(f=>f.id===fixtureId?{...f,result:val}:f)})),adminLog:[...(g.adminLog||[]),entry]};
    });
    setResultDraft(d=>{const n={...d};delete n[fixtureId];return n;});
  };`;
const newSave = `  const saveResult = async (fixtureId) => {
    const val = resultDraft[fixtureId];
    if (!val||!/^[0-9]+-[0-9]+$/.test(val)) return;
    const res = await fetch('/api/security', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ action:'group-admin', groupId: group.id, payload:{ type:'set-result', fixtureId, value: val } })
    });
    const data = await res.json().catch(()=>({}));
    if (res.ok && data.group) {
      setGroup(data.group);
      setResultDraft(d=>{const n={...d};delete n[fixtureId];return n;});
    }
  };`;
const oldClear = `  const clearResult = async (fixtureId) => {
    await updateGroup(g=>{
      const fixture = (g.gameweeks||[]).flatMap(gw=>gw.fixtures).find(f=>f.id===fixtureId);
      const entry={id:Date.now(),at:Date.now(),by:user.username,action:"result-clear",fixture:fixture?\`${'${fixture.home} vs ${fixture.away}'}\`:fixtureId,gw:currentGW,old:fixture?.result||null,new:null};
      return {...g,gameweeks:g.gameweeks.map(gw=>({...gw,fixtures:gw.fixtures.map(f=>f.id===fixtureId?{...f,result:null}:f)})),adminLog:[...(g.adminLog||[]),entry]};
    });
  };`;
const newClear = `  const clearResult = async (fixtureId) => {
    const res = await fetch('/api/security', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ action:'group-admin', groupId: group.id, payload:{ type:'clear-result', fixtureId } })
    });
    const data = await res.json().catch(()=>({}));
    if (res.ok && data.group) setGroup(data.group);
  };`;
const oldHidden = `  const toggleFixtureHidden = async (fixtureId) => {
    await updateGroup(g=>{
      const h = g.hiddenFixtures||[];
      return {...g, hiddenFixtures: h.includes(fixtureId) ? h.filter(id=>id!==fixtureId) : [...h, fixtureId]};
    });
  };`;
const newHidden = `  const toggleFixtureHidden = async (fixtureId) => {
    const res = await fetch('/api/security', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ action:'group-admin', groupId: group.id, payload:{ type:'toggle-hidden-fixture', fixtureId } })
    });
    const data = await res.json().catch(()=>({}));
    if (res.ok && data.group) setGroup(data.group);
  };`;
s=s.replace(oldSave,newSave).replace(oldClear,newClear).replace(oldHidden,newHidden);
fs.writeFileSync(path,s);
console.log('patched');
