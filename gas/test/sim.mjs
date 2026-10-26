// GASが Index.html を組み立てるのと同じことをして、google.script の偽物で動かす（node test/sim.mjs）
import { readFileSync, writeFileSync } from "node:fs";
const d = new URL("../dist/", import.meta.url);
let html = readFileSync(new URL("Index.html", d), "utf8");
html = html.replace("<?!= params ?>", "{}").replace(/<\?!= include\('(\w+)'\) \?>/g, (_, n) => readFileSync(new URL(`${n}.html`, d), "utf8"));
const stub = `<script>
window.__calls=[];
var google={script:{
 run:(function mk(){var s,f;var r={withSuccessHandler:function(x){s=x;return r},withFailureHandler:function(x){f=x;return r},
  boot:function(){__calls.push('boot');setTimeout(function(){s({state:'staff',me:{email:'owner@gmail.com',name:'持ち主'},url:'https://script.google.com/macros/s/X/exec',owner:'owner@gmail.com',version:'sim',now:Date.now(),
   data:{teams:[{id:'sakura',name:'桜中学校',shortName:'桜中',order:1,active:true}],staff:[{id:'owner@gmail.com',email:'owner@gmail.com',name:'持ち主',active:true}],activities:[{id:'a1',date:'2026-10-31',note:'',groups:[{division:'main',type:'練習',venue:'坂戸市立住吉中学校',startTime:'09:00',endTime:'12:00',meetTime:'08:40',meetPlace:'現地',packing:['水筒'],games:[],partners:[]}],updatedAt:{__ts:1761400000000}}]}})},300)},
  write:function(ops){__calls.push(['write',ops]);setTimeout(function(){s({ok:true,warnings:[],now:Date.now()})},200)}};
  return {get withSuccessHandler(){return r.withSuccessHandler}}})(),
 url:{getLocation:function(cb){cb({hash:'activities',parameter:{}})}},
 history:{push:function(a,b,h){__calls.push(['push',h])},replace:function(a,b,h){__calls.push(['replace',h])},setChangeHandler:function(){}}
}};
</script>`;
html = html.replace("<body", stub + "\n<body");
writeFileSync("/tmp/claude-0/sim.html", html);
console.log("ok", html.length);
