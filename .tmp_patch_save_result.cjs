const fs=require('fs');
const path='src/App.jsx';
let s=fs.readFileSync(path,'utf8');
const start=s.indexOf('  const saveResult = async (fixtureId) => {');
const end=s.indexOf('\n\n  const clearResult = async (fixtureId) => {', start);
if(start===-1||end===-1) throw new Error('saveResult block not found');
const next=`  const saveResult = async (fixtureId) => {
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
s=s.slice(0,start)+next+s.slice(end);
fs.writeFileSync(path,s);
console.log('patched saveResult');
