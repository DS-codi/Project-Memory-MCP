const Database = require('better-sqlite3');
const db = new Database('C:/Users/User/AppData/Roaming/ProjectMemory/project-memory.db');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables:', tables.map(t => t.name).join(', '));
try {
  const programs = db.prepare("SELECT * FROM programs LIMIT 5").all();
  console.log('Programs:', programs.length, programs.map(p => p.id + ' ' + p.title));
} catch(e) { console.error('programs error:', e.message); }
try {
  const pp = db.prepare("SELECT * FROM program_plans LIMIT 5").all();
  console.log('program_plans:', pp.length);
} catch(e) { console.error('program_plans error:', e.message); }
