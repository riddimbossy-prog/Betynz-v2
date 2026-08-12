const BRAND_RE=/golden\s+ban(?:k|g)er(?:\s+v\d+(?:\.\d+)*)?/gi;

function cleanText(value){
  return String(value??'')
    .replace(/golden\s+ban(?:k|g)er\s+match\s+breakdown/gi,'Match Breakdown')
    .replace(/golden\s+ban(?:k|g)er\s+qualification\s+gate/gi,'qualification gate')
    .replace(/golden\s+ban(?:k|g)er\s+split-form\s+rules/gi,'split-form rules')
    .replace(/golden\s+ban(?:k|g)er\s+is\s+still\s+analysing/gi,'The engine is still analysing')
    .replace(/loading\s+golden\s+ban(?:k|g)er\s+results/gi,'Loading results')
    .replace(/golden\s+ban(?:k|g)er\s+board/gi,'board')
    .replace(BRAND_RE,'')
    .replace(/\s{2,}/g,' ')
    .replace(/^\s*[·|–—-]\s*/,'')
    .trim();
}

function cleanNode(node){
  if(node.nodeType!==Node.TEXT_NODE)return;
  const parent=node.parentElement;
  if(!parent||/^(SCRIPT|STYLE|NOSCRIPT)$/i.test(parent.tagName))return;
  const next=cleanText(node.nodeValue);
  if(next!==node.nodeValue)node.nodeValue=next;
}

function cleanTree(root=document.body){
  if(!root)return;
  if(root.nodeType===Node.TEXT_NODE){cleanNode(root);return;}
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  let node;
  while((node=walker.nextNode()))cleanNode(node);
}

document.title=cleanText(document.title)||'Betynz';
cleanTree();

const observer=new MutationObserver(mutations=>{
  for(const mutation of mutations){
    if(mutation.type==='characterData')cleanNode(mutation.target);
    for(const node of mutation.addedNodes)cleanTree(node);
  }
});
observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true});
