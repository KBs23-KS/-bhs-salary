import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const source=(file)=>readFileSync(new URL(file,root),'utf8');
test('repository contains UI, API routes, rules, readme, env template',()=>{
 for(const p of ['index.html','src/main.js','src/style.css','api/admin.js','api/search.js','api/unlock.js','api/file.js','api/google-callback.js','api/upload-chunk.js','api/cron-backup.js','firestore.rules','.env.example','README-TH.md']) assert.ok(existsSync(new URL(p,root)),p);
});
test('database blocked from direct browser access',()=>assert.match(source('firestore.rules'),/allow read, write: if false/));
test('frontend keeps search and admin entry',()=>{
 const h=source('index.html');assert.match(h,/id="nationalId"/);assert.match(h,/id="publicYear"/);assert.match(h,/id="publicRound"/);assert.match(h,/id="adminTop"/);
});
test('no credentials in tracked source files',()=>{
 const text=source('api/_lib.js')+source('src/main.js');assert.doesNotMatch(text,/-----BEGIN PRIVATE KEY-----/);assert.doesNotMatch(text,/AIza[0-9A-Za-z_-]{30,}/);
});
