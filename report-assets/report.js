function toggleSection(el){
  var body=el.nextElementSibling;
  var isHidden=body.classList.contains('hidden');
  if(isHidden){body.classList.remove('hidden');el.classList.remove('collapsed')}
  else{body.classList.add('hidden');el.classList.add('collapsed')}
  updateProgress();
}
function toggleTheme(){
  document.body.classList.toggle('dark-theme');
  var isDark=document.body.classList.contains('dark-theme');
  localStorage.setItem('report-theme',isDark?'dark':'light');
  var btn=document.querySelector('.theme-btn');
  if(btn)btn.textContent=isDark?'☀️ 亮色':'🌙 暗色';
}
function initTheme(){
  var saved=localStorage.getItem('report-theme');
  if(saved==='dark'){document.body.classList.add('dark-theme');var btn=document.querySelector('.theme-btn');if(btn)btn.textContent='☀️ 亮色'}
}
function initCopyButtons(){
  document.querySelectorAll('.code-block').forEach(function(block){
    if(block.querySelector('.copy-btn'))return;
    var btn=document.createElement('button');btn.className='copy-btn';btn.textContent='复制';
    btn.onclick=function(){
      var code=block.textContent.replace('复制','').replace('已复制!','').trim();
      navigator.clipboard.writeText(code).then(function(){btn.textContent='已复制!';setTimeout(function(){btn.textContent='复制'},2000)});
    };
    block.appendChild(btn);
  });
}
function initRoadmap(){
  document.querySelectorAll('.roadmap-item input[type=checkbox]').forEach(function(cb){
    var key='roadmap-'+cb.id;
    cb.checked=localStorage.getItem(key)==='true';
    if(cb.checked)cb.closest('.roadmap-item').classList.add('checked');
    cb.addEventListener('change',function(){
      localStorage.setItem(key,cb.checked);
      cb.closest('.roadmap-item').classList.toggle('checked',cb.checked);
      updateProgress();
    });
  });
}
function updateProgress(){
  var total=document.querySelectorAll('.roadmap-item input[type=checkbox]').length;
  var checked=document.querySelectorAll('.roadmap-item input[type=checkbox]:checked').length;
  var pct=total>0?Math.round(checked/total*100):0;
  var fill=document.querySelector('.progress-bar .fill');
  var label=document.querySelector('.progress-label');
  if(fill)fill.style.width=pct+'%';
  if(label)label.textContent=checked+'/'+total+' ('+pct+'%)';
}
function initNavSidebar(){
  var sections=document.querySelectorAll('.section');
  var navItems=document.querySelectorAll('.nav-item');
  function updateActiveNav(){
    var scrollTop=window.scrollY||document.documentElement.scrollTop;
    var viewH=window.innerHeight;
    var best=null;
    var bestDist=Infinity;
    sections.forEach(function(s){
      var rect=s.getBoundingClientRect();
      var top=rect.top;
      var bottom=rect.bottom;
      var visibleTop=Math.max(0,top);
      var visibleBottom=Math.min(viewH,bottom);
      var visible=visibleBottom-visibleTop;
      if(visible>0){
        var dist=Math.abs(top);
        if(top<=viewH*0.35&&dist<bestDist){
          bestDist=dist;
          best=s;
        }
      }
    });
    navItems.forEach(function(item){item.classList.remove('active')});
    if(best){
      var id=best.id;
      var activeNav=document.querySelector('.nav-item[href="#'+id+'"]');
      if(activeNav)activeNav.classList.add('active');
    }
  }
  var scrollTimer=null;
  window.addEventListener('scroll',function(){
    if(scrollTimer)clearTimeout(scrollTimer);
    scrollTimer=setTimeout(updateActiveNav,50);
  },{passive:true});
  updateActiveNav();
}
function sortTable(table,col){
  var tbody=table.querySelector('tbody');
  var rows=Array.from(tbody.querySelectorAll('tr'));
  var asc=table.getAttribute('data-sort-dir')!=='asc';
  table.setAttribute('data-sort-dir',asc?'asc':'desc');
  rows.sort(function(a,b){
    var aVal=a.cells[col].textContent.trim();
    var bVal=b.cells[col].textContent.trim();
    return asc?aVal.localeCompare(bVal):bVal.localeCompare(aVal);
  });
  rows.forEach(function(r){tbody.appendChild(r)});
}
function saveReportData(){
  var issues=[];
  document.querySelectorAll('.issue-card').forEach(function(card){
    issues.push({
      title:card.querySelector('.ic-title')?card.querySelector('.ic-title').textContent.trim():'',
      severity:card.className.includes('critical')?'critical':card.className.includes('high')?'high':card.className.includes('medium')?'medium':'low',
      location:card.querySelector('.ic-loc')?card.querySelector('.ic-loc').textContent.trim():''
    });
  });
  var healthScores={};
  document.querySelectorAll('.health-row').forEach(function(row){
    var label=row.querySelector('.label')?row.querySelector('.label').textContent.trim():'';
    var val=row.querySelector('.val')?row.querySelector('.val').textContent.trim():'';
    healthScores[label]=val;
  });
  localStorage.setItem('todoflow-report-data',JSON.stringify({
    timestamp:new Date().toISOString(),
    issues:issues,
    healthScores:healthScores
  }));
}
function loadPreviousReport(){
  var saved=localStorage.getItem('todoflow-report-data');
  if(!saved)return null;
  try{return JSON.parse(saved)}catch(e){return null}
}
function initComparison(){
  var prev=loadPreviousReport();
  if(!prev){
    var el=document.getElementById('comparison');
    if(el){var body=el.querySelector('.section-body');if(body)body.innerHTML='<div class="note-block">暂无上次报告数据，这是首次生成报告。下次生成时将自动对比。</div>'}
    return;
  }
  var prevTime=prev.timestamp?new Date(prev.timestamp).toLocaleString('zh-CN'):'未知';
  var noteEl=document.querySelector('#comparison .note-block');
  if(noteEl)noteEl.textContent='上次报告时间：'+prevTime+' | 本次报告时间：'+new Date().toLocaleString('zh-CN');
  var currentIssues=[];
  document.querySelectorAll('.issue-card').forEach(function(card){
    currentIssues.push({
      title:card.querySelector('.ic-title')?card.querySelector('.ic-title').textContent.trim():'',
      severity:card.className.includes('critical')?'critical':card.className.includes('high')?'high':card.className.includes('medium')?'medium':'low',
      location:card.querySelector('.ic-loc')?card.querySelector('.ic-loc').textContent.trim():''
    });
  });
  var prevTitles=prev.issues.map(function(i){return i.title});
  var currTitles=currentIssues.map(function(i){return i.title});
  var newIssues=currentIssues.filter(function(i){return prevTitles.indexOf(i.title)===-1});
  var fixedIssues=prev.issues.filter(function(i){return currTitles.indexOf(i.title)===-1});
  var newBadge=document.querySelector('#comparison .header-badge.new');
  var fixedBadge=document.querySelector('#comparison .header-badge.fixed');
  if(newBadge)newBadge.textContent=newIssues.length+' 新增';
  if(fixedBadge)fixedBadge.textContent=fixedIssues.length+' 已修复';
}
document.addEventListener('DOMContentLoaded',function(){
  initTheme();initCopyButtons();initRoadmap();initNavSidebar();updateProgress();initComparison();
  setTimeout(saveReportData,1000);
});
