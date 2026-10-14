// Exercise the real client export/import functions in Node; no browser state is changed.
import { createServer } from 'vite';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=process.cwd();const originalFetch=globalThis.fetch;
globalThis.fetch=async(input,options)=>typeof input==='string'&&input.startsWith('/fonts/')?new Response(await readFile(path.join(root,'public',input))):originalFetch(input,options);
const server=await createServer({server:{middlewareMode:true},appType:'custom'});
try{
  const {resumePdf,extractResume}=await server.ssrLoadModule('/src/export.ts');
  const {manualResume,newJob}=await server.ssrLoadModule('/src/model.ts');
  const profile={name:'Zoë Martínez',email:'test@example.com',phone:'',location:'Chicago, IL',website:'https://example.com',summary:'Computer science student building accessible tools with Python, React, and SQL.',skills:['Python','React','SQL'],education:'BSc Computer Science — Example University\nExpected graduation: May 2027',resumeText:'',resumeName:'',experiences:[{id:'project1',kind:'Project',title:'Campus event finder',organization:'Personal project',dates:'Jan 2026 – Mar 2026',details:'Built a React interface to browse and filter campus events.\nDesigned a SQL database for event details and saved searches.\nAdded keyboard navigation and tested with 12 classmates.',skills:['React','SQL'],url:'https://example.com/events'},{id:'work1',kind:'Experience',title:'Student developer',organization:'Example University',dates:'Aug 2025 – Present',details:'Built Python scripts to clean research data.\nDocumented setup instructions for a team of 4 students.',skills:['Python'],url:''}]};
  const job=newJob({title:'Software Engineering Intern',company:'Example Company'});
  const resume=manualResume(profile);
  assert.equal(manualResume({...profile,education:'',experiences:[{...profile.experiences[0],kind:'Education'}]}).entries.length,1,'Education bank entry must be included when the separate education field is empty');
  const doc=await resumePdf(resume,job,false);
  assert.equal(doc.getNumberOfPages(),1);
  const output=path.resolve(process.env.APPLICATOR_QA_OUTPUT||path.join(root,'work','export-check'));await mkdir(output,{recursive:true});
  await writeFile(path.join(output,'sample-resume.pdf'),Buffer.from(doc.output('arraybuffer')));
  const extracted=await extractResume(new File(['Zoë Martínez\nPython, React, SQL'],'resume.txt'));
  assert.match(extracted,/Zoë Martínez/);
  await assert.rejects(extractResume(new File(['abc'],'resume.exe')),/PDF, DOCX, or TXT/);
  const extended={...resume,entries:Array.from({length:18},(_,i)=>({...resume.entries[0],sourceId:`long-${i}`,title:`Project ${i+1}`,bullets:Array.from({length:5},(_,n)=>`Implemented a documented feature ${n+1} using React and SQL, working with the university team to build accessible interfaces and readable data workflows.`)}))};
  const multi=await resumePdf(extended,job,false);assert.ok(multi.getNumberOfPages()>1);
  await writeFile(path.join(output,'long-resume.pdf'),Buffer.from(multi.output('arraybuffer')));
  console.log(JSON.stringify({shortResumePages:doc.getNumberOfPages(),longResumePages:multi.getNumberOfPages(),textImport:'passed',unsupportedFile:'rejected',output}));
}finally{globalThis.fetch=originalFetch;await server.close();}
