import test from 'node:test';
import assert from 'node:assert/strict';
import { groupLifecycle, fixtureBelongsToSeason } from '../shared/groupLifecycle.js';
import { buildGroupDashboardState } from '../src/groupDashboard.js';
import { mergeGlobalIntoGroup } from '../api/_fixtureSync.js';
const now = new Date('2026-09-10T12:00:00Z');
const old = {season:2025,currentGW:30,gameweeks:[{gw:30,season:2025,fixtures:[
  {id:'old',date:'2026-03-14T15:00:00Z',result:{home:1,away:0}},
  {id:'bad',date:'2027-03-20T15:00:00Z'}
]}]};
test('new-season fixtures do not belong in an old season',()=>assert.equal(fixtureBelongsToSeason(old.gameweeks[0].fixtures[1],'PL',2025),false));
test('finished old season is completed despite foreign fixtures',()=>assert.equal(groupLifecycle(old,now),'completed'));
test('old group never asks for picks from a contaminated future fixture',()=>{
 const s=buildGroupDashboardState(old,'test',now);
 assert.equal(s.mode,'completed'); assert.equal(s.missingPickCount,0); assert.equal(s.nextFixture,null);
});
test('missing historical results are distinct from a finished season',()=>assert.equal(groupLifecycle({...old,gameweeks:[]},now),'results-pending'));
test('empty current season is not complete',()=>assert.equal(groupLifecycle({season:2026,gameweeks:[]},now),'active'));
test('past World Cup with results is complete',()=>assert.equal(groupLifecycle({season:2026,competition:'WC',gameweeks:[{fixtures:[{date:'2026-07-19',result:{home:1,away:0}}]}]},now),'completed'));
test('merge refuses dates outside the requested season even if cache is mislabeled',()=>{
 const group={season:2025,competition:'PL',gameweeks:[{gw:30,season:2025,fixtures:[]}]};
 const global={...group,gameweeks:[{gw:30,season:2025,fixtures:[{id:'bad',home:'A',away:'B',date:'2027-03-20'}]}]};
 assert.equal(mergeGlobalIntoGroup(global,group).gameweeks[0].fixtures.length,0);
});
test('merge refuses a different cache season',()=>{
 const group={season:2025,competition:'PL',gameweeks:[]};
 assert.deepEqual(mergeGlobalIntoGroup({season:2026,competition:'PL',gameweeks:[]},group),group);
});
