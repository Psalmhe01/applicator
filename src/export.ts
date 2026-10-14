import type { Job, Resume, Workspace } from './model';
export function downloadFile(name:string,body:BlobPart,type:string) { const url=URL.createObjectURL(new Blob([body],{type})); const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000); }
export function exportBackup(workspace:Workspace) { downloadFile(`applicator-backup-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(workspace,null,2),'application/json'); }
export function exportCsv(jobs:Job[]) {
  const cell = (s:string) => `"${(/^[\s]*[=+@-]/.test(s)?`'${s}`:s).replace(/"/g,'""')}"`;
  const rows = [['Company','Role','Status','Application URL','Applied','Deadline','Follow up','Notes','Submitted resume version'],...jobs.map(j=>[j.company,j.title,j.status,j.url,j.appliedAt,j.deadline,j.followUp,j.notes,j.resumes.find(r=>r.id===j.appliedResumeId)?.createdAt || ''])];
  downloadFile('applicator-applications.csv','\uFEFF'+rows.map(r=>r.map(cell).join(',')).join('\r\n'),'text/csv;charset=utf-8');
}
let fontPromise:Promise<{regular:string,bold:string}>|undefined;
async function fonts() {
  fontPromise ??= Promise.all(['/fonts/NotoSans-Regular.ttf','/fonts/NotoSans-Bold.ttf'].map(async url=>{
    const res=await fetch(url);if(!res.ok) throw new Error('PDF fonts could not load. Restart the app and try again.');
    const bytes=new Uint8Array(await res.arrayBuffer()); let s=''; for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);
  })).then(([regular,bold])=>({regular,bold})).catch(e=>{fontPromise=undefined;throw e;});
  return fontPromise;
}
export async function resumePdf(resume:Resume,job:Job,save=true) {
  const [{ jsPDF },font]=await Promise.all([import('jspdf'),fonts()]);
  const doc=new jsPDF({unit:'pt',format:'letter'});
  doc.addFileToVFS('NotoSans-Regular.ttf',font.regular);doc.addFont('NotoSans-Regular.ttf','NotoSans','normal');
  doc.addFileToVFS('NotoSans-Bold.ttf',font.bold);doc.addFont('NotoSans-Bold.ttf','NotoSans','bold');
  doc.setProperties({title:`${resume.name} — ${job.company} — ${job.title}`,author:resume.name,subject:'Resume'});
  const margin=44,width=524,bottom=748;let y=48;
  const ensure=(height:number)=>{if(y+height>bottom){doc.addPage();y=44;}};
  const measure=(value:string,size=10,bold=false,indent=0)=>{if(!value.trim())return 0;doc.setFont('NotoSans',bold?'bold':'normal');doc.setFontSize(size);return doc.splitTextToSize(value,width-indent).length*size*1.45+3;};
  const write=(value:string,size=10,bold=false,indent=0)=>{
    if(!value.trim())return;
    ensure(Math.min(measure(value,size,bold,indent),bottom-44));
    doc.setFont('NotoSans',bold?'bold':'normal');doc.setFontSize(size);doc.setTextColor(25,30,29);
    const lines=doc.splitTextToSize(value,width-indent) as string[];
    for(const line of lines){ensure(size*1.45);doc.text(line,margin+indent,y);y+=size*1.45;}
    y+=3;
  };
  const section=(title:string,after=0)=>{ensure(Math.min(36+after,bottom-44));y+=10;write(title.toUpperCase(),10,true);doc.setDrawColor(170);doc.line(margin,y-4,margin+width,y-4);y+=8;};
  write(resume.name,21,true);write([resume.email,resume.phone,resume.location,resume.website].filter(Boolean).join('  |  '),9);
  if(resume.summary.trim()){section('Profile',measure(resume.summary));write(resume.summary);}
  if(resume.skills.length){section('Skills',measure(resume.skills.join(' · ')));write(resume.skills.join(' · '));}
  const firstLines=(e:Resume['entries'][number])=>measure([e.title,e.organization].filter(Boolean).join(' — '),10,true)+measure(e.dates,9)+measure(e.url,9)+measure(e.bullets[0]||'',10,false,12);
  for(const kind of ['Experience','Project','Volunteering','Education']){
    const entries=resume.entries.filter(e=>e.kind===kind);if(!entries.length)continue;section(kind==='Project'?'Projects':kind,firstLines(entries[0]));
    for(const e of entries){ensure(Math.min(firstLines(e),bottom-44));write([e.title,e.organization].filter(Boolean).join(' — '),10,true);if(e.dates)write(e.dates,9);if(e.url)write(e.url,9);for(const bullet of e.bullets){ensure(Math.min(measure(bullet,10,false,12),bottom-44));doc.setFont('NotoSans','normal');doc.setFontSize(10);doc.text('•',margin+2,y);write(bullet,10,false,12);}y+=6;}
  }
  if(resume.education.trim()){section('Education',measure(resume.education));write(resume.education);}
  const filename=`${resume.name || 'Resume'}-${job.company}-${job.title}`.replace(/[^\p{L}\p{N}_. -]/gu,'').slice(0,140)+'.pdf';
  if(save)doc.save(filename);return doc;
}
export async function extractResume(file:File):Promise<string> {
  if(file.size>10*1024*1024)throw new Error('Choose a resume smaller than 10 MB.');
  if(/\.txt$/i.test(file.name))return (await file.text()).slice(0,50000);
  if(/\.docx$/i.test(file.name)){const mammoth=await import('mammoth/mammoth.browser');return (await mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()})).value.slice(0,50000);}
  if(/\.pdf$/i.test(file.name)){
    const pdfjs=await import('pdfjs-dist');const worker=(await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;pdfjs.GlobalWorkerOptions.workerSrc=worker;
    const pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
    if(pdf.numPages>15){await pdf.destroy();throw new Error('Upload a resume of 15 pages or fewer.');}
    const pages=[];try{for(let p=1;p<=pdf.numPages;p++){const page=await pdf.getPage(p);const content=await page.getTextContent();pages.push(content.items.map(item=>'str' in item ? item.str+('hasEOL' in item && item.hasEOL?'\n':' '):'').join(''));}}finally{await pdf.destroy();}
    const result=pages.join('\n\n').slice(0,50000);if(result.trim().length<30)throw new Error('This PDF appears to be scanned. Paste the resume text or upload a DOCX/text PDF.');return result;
  }
  throw new Error('Upload a PDF, DOCX, or TXT resume.');
}
