"use strict";var er=Object.create;var dt=Object.defineProperty;var tr=Object.getOwnPropertyDescriptor;var sr=Object.getOwnPropertyNames;var nr=Object.getPrototypeOf,or=Object.prototype.hasOwnProperty;var O=(s,e)=>()=>(e||s((e={exports:{}}).exports,e),e.exports),rr=(s,e)=>{for(var t in e)dt(s,t,{get:e[t],enumerable:!0})},zs=(s,e,t,n)=>{if(e&&typeof e=="object"||typeof e=="function")for(let o of sr(e))!or.call(s,o)&&o!==t&&dt(s,o,{get:()=>e[o],enumerable:!(n=tr(e,o))||n.enumerable});return s};var G=(s,e,t)=>(t=s!=null?er(nr(s)):{},zs(e||!s||!s.__esModule?dt(t,"default",{value:s,enumerable:!0}):t,s)),ir=s=>zs(dt({},"__esModule",{value:!0}),s);var qe=O((Ec,Js)=>{"use strict";var cr=require("path"),we="\\\\/",Ys=`[^${we}]`,be="\\.",lr="\\+",dr="\\?",ut="\\/",pr="(?=.)",Qs="[^/]",Ut=`(?:${ut}|$)`,Xs=`(?:^|${ut})`,Gt=`${be}{1,2}${Ut}`,ur=`(?!${be})`,hr=`(?!${Xs}${Gt})`,fr=`(?!${be}{0,1}${Ut})`,gr=`(?!${Gt})`,mr=`[^.${ut}]`,wr=`${Qs}*?`,Zs={DOT_LITERAL:be,PLUS_LITERAL:lr,QMARK_LITERAL:dr,SLASH_LITERAL:ut,ONE_CHAR:pr,QMARK:Qs,END_ANCHOR:Ut,DOTS_SLASH:Gt,NO_DOT:ur,NO_DOTS:hr,NO_DOT_SLASH:fr,NO_DOTS_SLASH:gr,QMARK_NO_DOT:mr,STAR:wr,START_ANCHOR:Xs},vr={...Zs,SLASH_LITERAL:`[${we}]`,QMARK:Ys,STAR:`${Ys}*?`,DOTS_SLASH:`${be}{1,2}(?:[${we}]|$)`,NO_DOT:`(?!${be})`,NO_DOTS:`(?!(?:^|[${we}])${be}{1,2}(?:[${we}]|$))`,NO_DOT_SLASH:`(?!${be}{0,1}(?:[${we}]|$))`,NO_DOTS_SLASH:`(?!${be}{1,2}(?:[${we}]|$))`,QMARK_NO_DOT:`[^.${we}]`,START_ANCHOR:`(?:^|[${we}])`,END_ANCHOR:`(?:[${we}]|$)`},yr={alnum:"a-zA-Z0-9",alpha:"a-zA-Z",ascii:"\\x00-\\x7F",blank:" \\t",cntrl:"\\x00-\\x1F\\x7F",digit:"0-9",graph:"\\x21-\\x7E",lower:"a-z",print:"\\x20-\\x7E ",punct:"\\-!\"#$%&'()\\*+,./:;<=>?@[\\]^_`{|}~",space:" \\t\\r\\n\\v\\f",upper:"A-Z",word:"A-Za-z0-9_",xdigit:"A-Fa-f0-9"};Js.exports={MAX_LENGTH:1024*64,POSIX_REGEX_SOURCE:yr,REGEX_BACKSLASH:/\\(?![*+?^${}(|)[\]])/g,REGEX_NON_SPECIAL_CHARS:/^[^@![\].,$*+?^{}()|\\/]+/,REGEX_SPECIAL_CHARS:/[-*+?.^${}(|)[\]]/,REGEX_SPECIAL_CHARS_BACKREF:/(\\?)((\W)(\3*))/g,REGEX_SPECIAL_CHARS_GLOBAL:/([-*+?.^${}(|)[\]])/g,REGEX_REMOVE_BACKSLASH:/(?:\[.*?[^\\]\]|\\(?=.))/g,REPLACEMENTS:{"***":"*","**/**":"**","**/**/**":"**"},CHAR_0:48,CHAR_9:57,CHAR_UPPERCASE_A:65,CHAR_LOWERCASE_A:97,CHAR_UPPERCASE_Z:90,CHAR_LOWERCASE_Z:122,CHAR_LEFT_PARENTHESES:40,CHAR_RIGHT_PARENTHESES:41,CHAR_ASTERISK:42,CHAR_AMPERSAND:38,CHAR_AT:64,CHAR_BACKWARD_SLASH:92,CHAR_CARRIAGE_RETURN:13,CHAR_CIRCUMFLEX_ACCENT:94,CHAR_COLON:58,CHAR_COMMA:44,CHAR_DOT:46,CHAR_DOUBLE_QUOTE:34,CHAR_EQUAL:61,CHAR_EXCLAMATION_MARK:33,CHAR_FORM_FEED:12,CHAR_FORWARD_SLASH:47,CHAR_GRAVE_ACCENT:96,CHAR_HASH:35,CHAR_HYPHEN_MINUS:45,CHAR_LEFT_ANGLE_BRACKET:60,CHAR_LEFT_CURLY_BRACE:123,CHAR_LEFT_SQUARE_BRACKET:91,CHAR_LINE_FEED:10,CHAR_NO_BREAK_SPACE:160,CHAR_PERCENT:37,CHAR_PLUS:43,CHAR_QUESTION_MARK:63,CHAR_RIGHT_ANGLE_BRACKET:62,CHAR_RIGHT_CURLY_BRACE:125,CHAR_RIGHT_SQUARE_BRACKET:93,CHAR_SEMICOLON:59,CHAR_SINGLE_QUOTE:39,CHAR_SPACE:32,CHAR_TAB:9,CHAR_UNDERSCORE:95,CHAR_VERTICAL_LINE:124,CHAR_ZERO_WIDTH_NOBREAK_SPACE:65279,SEP:cr.sep,extglobChars(s){return{"!":{type:"negate",open:"(?:(?!(?:",close:`))${s.STAR})`},"?":{type:"qmark",open:"(?:",close:")?"},"+":{type:"plus",open:"(?:",close:")+"},"*":{type:"star",open:"(?:",close:")*"},"@":{type:"at",open:"(?:",close:")"}}},globChars(s){return s===!0?vr:Zs}}});var ht=O(ie=>{"use strict";var br=require("path"),_r=process.platform==="win32",{REGEX_BACKSLASH:kr,REGEX_REMOVE_BACKSLASH:xr,REGEX_SPECIAL_CHARS:Pr,REGEX_SPECIAL_CHARS_GLOBAL:Cr}=qe();ie.isObject=s=>s!==null&&typeof s=="object"&&!Array.isArray(s);ie.hasRegexChars=s=>Pr.test(s);ie.isRegexChar=s=>s.length===1&&ie.hasRegexChars(s);ie.escapeRegex=s=>s.replace(Cr,"\\$1");ie.toPosixSlashes=s=>s.replace(kr,"/");ie.removeBackslashes=s=>s.replace(xr,e=>e==="\\"?"":e);ie.supportsLookbehinds=()=>{let s=process.version.slice(1).split(".").map(Number);return s.length===3&&s[0]>=9||s[0]===8&&s[1]>=10};ie.isWindows=s=>s&&typeof s.windows=="boolean"?s.windows:_r===!0||br.sep==="\\";ie.escapeLast=(s,e,t)=>{let n=s.lastIndexOf(e,t);return n===-1?s:s[n-1]==="\\"?ie.escapeLast(s,e,n-1):`${s.slice(0,n)}\\${s.slice(n)}`};ie.removePrefix=(s,e={})=>{let t=s;return t.startsWith("./")&&(t=t.slice(2),e.prefix="./"),t};ie.wrapOutput=(s,e={},t={})=>{let n=t.contains?"":"^",o=t.contains?"":"$",i=`${n}(?:${s})${o}`;return e.negated===!0&&(i=`(?:^(?!${i}).*$)`),i}});var cn=O((Tc,an)=>{"use strict";var en=ht(),{CHAR_ASTERISK:zt,CHAR_AT:Sr,CHAR_BACKWARD_SLASH:Ue,CHAR_COMMA:Rr,CHAR_DOT:Vt,CHAR_EXCLAMATION_MARK:Kt,CHAR_FORWARD_SLASH:rn,CHAR_LEFT_CURLY_BRACE:Yt,CHAR_LEFT_PARENTHESES:Qt,CHAR_LEFT_SQUARE_BRACKET:Er,CHAR_PLUS:Ar,CHAR_QUESTION_MARK:tn,CHAR_RIGHT_CURLY_BRACE:Tr,CHAR_RIGHT_PARENTHESES:sn,CHAR_RIGHT_SQUARE_BRACKET:Ir}=qe(),nn=s=>s===rn||s===Ue,on=s=>{s.isPrefix!==!0&&(s.depth=s.isGlobstar?1/0:1)},$r=(s,e)=>{let t=e||{},n=s.length-1,o=t.parts===!0||t.scanToEnd===!0,i=[],r=[],a=[],c=s,d=-1,u=0,h=0,l=!1,f=!1,m=!1,y=!1,_=!1,C=!1,S=!1,P=!1,$=!1,I=!1,R=0,W,k,T={value:"",depth:0,isGlob:!1},A=()=>d>=n,g=()=>c.charCodeAt(d+1),N=()=>(W=k,c.charCodeAt(++d));for(;d<n;){k=N();let J;if(k===Ue){S=T.backslashes=!0,k=N(),k===Yt&&(C=!0);continue}if(C===!0||k===Yt){for(R++;A()!==!0&&(k=N());){if(k===Ue){S=T.backslashes=!0,N();continue}if(k===Yt){R++;continue}if(C!==!0&&k===Vt&&(k=N())===Vt){if(l=T.isBrace=!0,m=T.isGlob=!0,I=!0,o===!0)continue;break}if(C!==!0&&k===Rr){if(l=T.isBrace=!0,m=T.isGlob=!0,I=!0,o===!0)continue;break}if(k===Tr&&(R--,R===0)){C=!1,l=T.isBrace=!0,I=!0;break}}if(o===!0)continue;break}if(k===rn){if(i.push(d),r.push(T),T={value:"",depth:0,isGlob:!1},I===!0)continue;if(W===Vt&&d===u+1){u+=2;continue}h=d+1;continue}if(t.noext!==!0&&(k===Ar||k===Sr||k===zt||k===tn||k===Kt)===!0&&g()===Qt){if(m=T.isGlob=!0,y=T.isExtglob=!0,I=!0,k===Kt&&d===u&&($=!0),o===!0){for(;A()!==!0&&(k=N());){if(k===Ue){S=T.backslashes=!0,k=N();continue}if(k===sn){m=T.isGlob=!0,I=!0;break}}continue}break}if(k===zt){if(W===zt&&(_=T.isGlobstar=!0),m=T.isGlob=!0,I=!0,o===!0)continue;break}if(k===tn){if(m=T.isGlob=!0,I=!0,o===!0)continue;break}if(k===Er){for(;A()!==!0&&(J=N());){if(J===Ue){S=T.backslashes=!0,N();continue}if(J===Ir){f=T.isBracket=!0,m=T.isGlob=!0,I=!0;break}}if(o===!0)continue;break}if(t.nonegate!==!0&&k===Kt&&d===u){P=T.negated=!0,u++;continue}if(t.noparen!==!0&&k===Qt){if(m=T.isGlob=!0,o===!0){for(;A()!==!0&&(k=N());){if(k===Qt){S=T.backslashes=!0,k=N();continue}if(k===sn){I=!0;break}}continue}break}if(m===!0){if(I=!0,o===!0)continue;break}}t.noext===!0&&(y=!1,m=!1);let M=c,Q="",w="";u>0&&(Q=c.slice(0,u),c=c.slice(u),h-=u),M&&m===!0&&h>0?(M=c.slice(0,h),w=c.slice(h)):m===!0?(M="",w=c):M=c,M&&M!==""&&M!=="/"&&M!==c&&nn(M.charCodeAt(M.length-1))&&(M=M.slice(0,-1)),t.unescape===!0&&(w&&(w=en.removeBackslashes(w)),M&&S===!0&&(M=en.removeBackslashes(M)));let v={prefix:Q,input:s,start:u,base:M,glob:w,isBrace:l,isBracket:f,isGlob:m,isExtglob:y,isGlobstar:_,negated:P,negatedExtglob:$};if(t.tokens===!0&&(v.maxDepth=0,nn(k)||r.push(T),v.tokens=r),t.parts===!0||t.tokens===!0){let J;for(let B=0;B<i.length;B++){let ge=J?J+1:u,me=i[B],ae=s.slice(ge,me);t.tokens&&(B===0&&u!==0?(r[B].isPrefix=!0,r[B].value=Q):r[B].value=ae,on(r[B]),v.maxDepth+=r[B].depth),(B!==0||ae!=="")&&a.push(ae),J=me}if(J&&J+1<s.length){let B=s.slice(J+1);a.push(B),t.tokens&&(r[r.length-1].value=B,on(r[r.length-1]),v.maxDepth+=r[r.length-1].depth)}v.slashes=i,v.parts=a}return v};an.exports=$r});var pn=O((Ic,dn)=>{"use strict";var ft=qe(),ce=ht(),{MAX_LENGTH:gt,POSIX_REGEX_SOURCE:Mr,REGEX_NON_SPECIAL_CHARS:Dr,REGEX_SPECIAL_CHARS_BACKREF:Fr,REPLACEMENTS:ln}=ft,Lr=(s,e)=>{if(typeof e.expandRange=="function")return e.expandRange(...s,e);s.sort();let t=`[${s.join("-")}]`;try{new RegExp(t)}catch{return s.map(o=>ce.escapeRegex(o)).join("..")}return t},Ie=(s,e)=>`Missing ${s}: "${e}" - use "\\\\${e}" to match literal characters`,Xt=(s,e)=>{if(typeof s!="string")throw new TypeError("Expected a string");s=ln[s]||s;let t={...e},n=typeof t.maxLength=="number"?Math.min(gt,t.maxLength):gt,o=s.length;if(o>n)throw new SyntaxError(`Input length: ${o}, exceeds maximum allowed length: ${n}`);let i={type:"bos",value:"",output:t.prepend||""},r=[i],a=t.capture?"":"?:",c=ce.isWindows(e),d=ft.globChars(c),u=ft.extglobChars(d),{DOT_LITERAL:h,PLUS_LITERAL:l,SLASH_LITERAL:f,ONE_CHAR:m,DOTS_SLASH:y,NO_DOT:_,NO_DOT_SLASH:C,NO_DOTS_SLASH:S,QMARK:P,QMARK_NO_DOT:$,STAR:I,START_ANCHOR:R}=d,W=x=>`(${a}(?:(?!${R}${x.dot?y:h}).)*?)`,k=t.dot?"":_,T=t.dot?P:$,A=t.bash===!0?W(t):I;t.capture&&(A=`(${A})`),typeof t.noext=="boolean"&&(t.noextglob=t.noext);let g={input:s,index:-1,start:0,dot:t.dot===!0,consumed:"",output:"",prefix:"",backtrack:!1,negated:!1,brackets:0,braces:0,parens:0,quotes:0,globstar:!1,tokens:r};s=ce.removePrefix(s,g),o=s.length;let N=[],M=[],Q=[],w=i,v,J=()=>g.index===o-1,B=g.peek=(x=1)=>s[g.index+x],ge=g.advance=()=>s[++g.index]||"",me=()=>s.slice(g.index+1),ae=(x="",U=0)=>{g.consumed+=x,g.index+=U},it=x=>{g.output+=x.output!=null?x.output:x.value,ae(x.value)},Zo=()=>{let x=1;for(;B()==="!"&&(B(2)!=="("||B(3)==="?");)ge(),g.start++,x++;return x%2===0?!1:(g.negated=!0,g.start++,!0)},at=x=>{g[x]++,Q.push(x)},ke=x=>{g[x]--,Q.pop()},L=x=>{if(w.type==="globstar"){let U=g.braces>0&&(x.type==="comma"||x.type==="brace"),b=x.extglob===!0||N.length&&(x.type==="pipe"||x.type==="paren");x.type!=="slash"&&x.type!=="paren"&&!U&&!b&&(g.output=g.output.slice(0,-w.output.length),w.type="star",w.value="*",w.output=A,g.output+=w.output)}if(N.length&&x.type!=="paren"&&(N[N.length-1].inner+=x.value),(x.value||x.output)&&it(x),w&&w.type==="text"&&x.type==="text"){w.value+=x.value,w.output=(w.output||"")+x.value;return}x.prev=w,r.push(x),w=x},ct=(x,U)=>{let b={...u[U],conditions:1,inner:""};b.prev=w,b.parens=g.parens,b.output=g.output;let F=(t.capture?"(":"")+b.open;at("parens"),L({type:x,value:U,output:g.output?"":m}),L({type:"paren",extglob:!0,value:ge(),output:F}),N.push(b)},Jo=x=>{let U=x.close+(t.capture?")":""),b;if(x.type==="negate"){let F=A;if(x.inner&&x.inner.length>1&&x.inner.includes("/")&&(F=W(t)),(F!==A||J()||/^\)+$/.test(me()))&&(U=x.close=`)$))${F}`),x.inner.includes("*")&&(b=me())&&/^\.[^\\/.]+$/.test(b)){let z=Xt(b,{...e,fastpaths:!1}).output;U=x.close=`)${z})${F})`}x.prev.type==="bos"&&(g.negatedExtglob=!0)}L({type:"paren",extglob:!0,value:v,output:U}),ke("parens")};if(t.fastpaths!==!1&&!/(^[*!]|[/()[\]{}"])/.test(s)){let x=!1,U=s.replace(Fr,(b,F,z,oe,K,Wt)=>oe==="\\"?(x=!0,b):oe==="?"?F?F+oe+(K?P.repeat(K.length):""):Wt===0?T+(K?P.repeat(K.length):""):P.repeat(z.length):oe==="."?h.repeat(z.length):oe==="*"?F?F+oe+(K?A:""):A:F?b:`\\${b}`);return x===!0&&(t.unescape===!0?U=U.replace(/\\/g,""):U=U.replace(/\\+/g,b=>b.length%2===0?"\\\\":b?"\\":"")),U===s&&t.contains===!0?(g.output=s,g):(g.output=ce.wrapOutput(U,g,e),g)}for(;!J();){if(v=ge(),v==="\0")continue;if(v==="\\"){let b=B();if(b==="/"&&t.bash!==!0||b==="."||b===";")continue;if(!b){v+="\\",L({type:"text",value:v});continue}let F=/^\\+/.exec(me()),z=0;if(F&&F[0].length>2&&(z=F[0].length,g.index+=z,z%2!==0&&(v+="\\")),t.unescape===!0?v=ge():v+=ge(),g.brackets===0){L({type:"text",value:v});continue}}if(g.brackets>0&&(v!=="]"||w.value==="["||w.value==="[^")){if(t.posix!==!1&&v===":"){let b=w.value.slice(1);if(b.includes("[")&&(w.posix=!0,b.includes(":"))){let F=w.value.lastIndexOf("["),z=w.value.slice(0,F),oe=w.value.slice(F+2),K=Mr[oe];if(K){w.value=z+K,g.backtrack=!0,ge(),!i.output&&r.indexOf(w)===1&&(i.output=m);continue}}}(v==="["&&B()!==":"||v==="-"&&B()==="]")&&(v=`\\${v}`),v==="]"&&(w.value==="["||w.value==="[^")&&(v=`\\${v}`),t.posix===!0&&v==="!"&&w.value==="["&&(v="^"),w.value+=v,it({value:v});continue}if(g.quotes===1&&v!=='"'){v=ce.escapeRegex(v),w.value+=v,it({value:v});continue}if(v==='"'){g.quotes=g.quotes===1?0:1,t.keepQuotes===!0&&L({type:"text",value:v});continue}if(v==="("){at("parens"),L({type:"paren",value:v});continue}if(v===")"){if(g.parens===0&&t.strictBrackets===!0)throw new SyntaxError(Ie("opening","("));let b=N[N.length-1];if(b&&g.parens===b.parens+1){Jo(N.pop());continue}L({type:"paren",value:v,output:g.parens?")":"\\)"}),ke("parens");continue}if(v==="["){if(t.nobracket===!0||!me().includes("]")){if(t.nobracket!==!0&&t.strictBrackets===!0)throw new SyntaxError(Ie("closing","]"));v=`\\${v}`}else at("brackets");L({type:"bracket",value:v});continue}if(v==="]"){if(t.nobracket===!0||w&&w.type==="bracket"&&w.value.length===1){L({type:"text",value:v,output:`\\${v}`});continue}if(g.brackets===0){if(t.strictBrackets===!0)throw new SyntaxError(Ie("opening","["));L({type:"text",value:v,output:`\\${v}`});continue}ke("brackets");let b=w.value.slice(1);if(w.posix!==!0&&b[0]==="^"&&!b.includes("/")&&(v=`/${v}`),w.value+=v,it({value:v}),t.literalBrackets===!1||ce.hasRegexChars(b))continue;let F=ce.escapeRegex(w.value);if(g.output=g.output.slice(0,-w.value.length),t.literalBrackets===!0){g.output+=F,w.value=F;continue}w.value=`(${a}${F}|${w.value})`,g.output+=w.value;continue}if(v==="{"&&t.nobrace!==!0){at("braces");let b={type:"brace",value:v,output:"(",outputIndex:g.output.length,tokensIndex:g.tokens.length};M.push(b),L(b);continue}if(v==="}"){let b=M[M.length-1];if(t.nobrace===!0||!b){L({type:"text",value:v,output:v});continue}let F=")";if(b.dots===!0){let z=r.slice(),oe=[];for(let K=z.length-1;K>=0&&(r.pop(),z[K].type!=="brace");K--)z[K].type!=="dots"&&oe.unshift(z[K].value);F=Lr(oe,t),g.backtrack=!0}if(b.comma!==!0&&b.dots!==!0){let z=g.output.slice(0,b.outputIndex),oe=g.tokens.slice(b.tokensIndex);b.value=b.output="\\{",v=F="\\}",g.output=z;for(let K of oe)g.output+=K.output||K.value}L({type:"brace",value:v,output:F}),ke("braces"),M.pop();continue}if(v==="|"){N.length>0&&N[N.length-1].conditions++,L({type:"text",value:v});continue}if(v===","){let b=v,F=M[M.length-1];F&&Q[Q.length-1]==="braces"&&(F.comma=!0,b="|"),L({type:"comma",value:v,output:b});continue}if(v==="/"){if(w.type==="dot"&&g.index===g.start+1){g.start=g.index+1,g.consumed="",g.output="",r.pop(),w=i;continue}L({type:"slash",value:v,output:f});continue}if(v==="."){if(g.braces>0&&w.type==="dot"){w.value==="."&&(w.output=h);let b=M[M.length-1];w.type="dots",w.output+=v,w.value+=v,b.dots=!0;continue}if(g.braces+g.parens===0&&w.type!=="bos"&&w.type!=="slash"){L({type:"text",value:v,output:h});continue}L({type:"dot",value:v,output:h});continue}if(v==="?"){if(!(w&&w.value==="(")&&t.noextglob!==!0&&B()==="("&&B(2)!=="?"){ct("qmark",v);continue}if(w&&w.type==="paren"){let F=B(),z=v;if(F==="<"&&!ce.supportsLookbehinds())throw new Error("Node.js v10 or higher is required for regex lookbehinds");(w.value==="("&&!/[!=<:]/.test(F)||F==="<"&&!/<([!=]|\w+>)/.test(me()))&&(z=`\\${v}`),L({type:"text",value:v,output:z});continue}if(t.dot!==!0&&(w.type==="slash"||w.type==="bos")){L({type:"qmark",value:v,output:$});continue}L({type:"qmark",value:v,output:P});continue}if(v==="!"){if(t.noextglob!==!0&&B()==="("&&(B(2)!=="?"||!/[!=<:]/.test(B(3)))){ct("negate",v);continue}if(t.nonegate!==!0&&g.index===0){Zo();continue}}if(v==="+"){if(t.noextglob!==!0&&B()==="("&&B(2)!=="?"){ct("plus",v);continue}if(w&&w.value==="("||t.regex===!1){L({type:"plus",value:v,output:l});continue}if(w&&(w.type==="bracket"||w.type==="paren"||w.type==="brace")||g.parens>0){L({type:"plus",value:v});continue}L({type:"plus",value:l});continue}if(v==="@"){if(t.noextglob!==!0&&B()==="("&&B(2)!=="?"){L({type:"at",extglob:!0,value:v,output:""});continue}L({type:"text",value:v});continue}if(v!=="*"){(v==="$"||v==="^")&&(v=`\\${v}`);let b=Dr.exec(me());b&&(v+=b[0],g.index+=b[0].length),L({type:"text",value:v});continue}if(w&&(w.type==="globstar"||w.star===!0)){w.type="star",w.star=!0,w.value+=v,w.output=A,g.backtrack=!0,g.globstar=!0,ae(v);continue}let x=me();if(t.noextglob!==!0&&/^\([^?]/.test(x)){ct("star",v);continue}if(w.type==="star"){if(t.noglobstar===!0){ae(v);continue}let b=w.prev,F=b.prev,z=b.type==="slash"||b.type==="bos",oe=F&&(F.type==="star"||F.type==="globstar");if(t.bash===!0&&(!z||x[0]&&x[0]!=="/")){L({type:"star",value:v,output:""});continue}let K=g.braces>0&&(b.type==="comma"||b.type==="brace"),Wt=N.length&&(b.type==="pipe"||b.type==="paren");if(!z&&b.type!=="paren"&&!K&&!Wt){L({type:"star",value:v,output:""});continue}for(;x.slice(0,3)==="/**";){let lt=s[g.index+4];if(lt&&lt!=="/")break;x=x.slice(3),ae("/**",3)}if(b.type==="bos"&&J()){w.type="globstar",w.value+=v,w.output=W(t),g.output=w.output,g.globstar=!0,ae(v);continue}if(b.type==="slash"&&b.prev.type!=="bos"&&!oe&&J()){g.output=g.output.slice(0,-(b.output+w.output).length),b.output=`(?:${b.output}`,w.type="globstar",w.output=W(t)+(t.strictSlashes?")":"|$)"),w.value+=v,g.globstar=!0,g.output+=b.output+w.output,ae(v);continue}if(b.type==="slash"&&b.prev.type!=="bos"&&x[0]==="/"){let lt=x[1]!==void 0?"|$":"";g.output=g.output.slice(0,-(b.output+w.output).length),b.output=`(?:${b.output}`,w.type="globstar",w.output=`${W(t)}${f}|${f}${lt})`,w.value+=v,g.output+=b.output+w.output,g.globstar=!0,ae(v+ge()),L({type:"slash",value:"/",output:""});continue}if(b.type==="bos"&&x[0]==="/"){w.type="globstar",w.value+=v,w.output=`(?:^|${f}|${W(t)}${f})`,g.output=w.output,g.globstar=!0,ae(v+ge()),L({type:"slash",value:"/",output:""});continue}g.output=g.output.slice(0,-w.output.length),w.type="globstar",w.output=W(t),w.value+=v,g.output+=w.output,g.globstar=!0,ae(v);continue}let U={type:"star",value:v,output:A};if(t.bash===!0){U.output=".*?",(w.type==="bos"||w.type==="slash")&&(U.output=k+U.output),L(U);continue}if(w&&(w.type==="bracket"||w.type==="paren")&&t.regex===!0){U.output=v,L(U);continue}(g.index===g.start||w.type==="slash"||w.type==="dot")&&(w.type==="dot"?(g.output+=C,w.output+=C):t.dot===!0?(g.output+=S,w.output+=S):(g.output+=k,w.output+=k),B()!=="*"&&(g.output+=m,w.output+=m)),L(U)}for(;g.brackets>0;){if(t.strictBrackets===!0)throw new SyntaxError(Ie("closing","]"));g.output=ce.escapeLast(g.output,"["),ke("brackets")}for(;g.parens>0;){if(t.strictBrackets===!0)throw new SyntaxError(Ie("closing",")"));g.output=ce.escapeLast(g.output,"("),ke("parens")}for(;g.braces>0;){if(t.strictBrackets===!0)throw new SyntaxError(Ie("closing","}"));g.output=ce.escapeLast(g.output,"{"),ke("braces")}if(t.strictSlashes!==!0&&(w.type==="star"||w.type==="bracket")&&L({type:"maybe_slash",value:"",output:`${f}?`}),g.backtrack===!0){g.output="";for(let x of g.tokens)g.output+=x.output!=null?x.output:x.value,x.suffix&&(g.output+=x.suffix)}return g};Xt.fastpaths=(s,e)=>{let t={...e},n=typeof t.maxLength=="number"?Math.min(gt,t.maxLength):gt,o=s.length;if(o>n)throw new SyntaxError(`Input length: ${o}, exceeds maximum allowed length: ${n}`);s=ln[s]||s;let i=ce.isWindows(e),{DOT_LITERAL:r,SLASH_LITERAL:a,ONE_CHAR:c,DOTS_SLASH:d,NO_DOT:u,NO_DOTS:h,NO_DOTS_SLASH:l,STAR:f,START_ANCHOR:m}=ft.globChars(i),y=t.dot?h:u,_=t.dot?l:u,C=t.capture?"":"?:",S={negated:!1,prefix:""},P=t.bash===!0?".*?":f;t.capture&&(P=`(${P})`);let $=k=>k.noglobstar===!0?P:`(${C}(?:(?!${m}${k.dot?d:r}).)*?)`,I=k=>{switch(k){case"*":return`${y}${c}${P}`;case".*":return`${r}${c}${P}`;case"*.*":return`${y}${P}${r}${c}${P}`;case"*/*":return`${y}${P}${a}${c}${_}${P}`;case"**":return y+$(t);case"**/*":return`(?:${y}${$(t)}${a})?${_}${c}${P}`;case"**/*.*":return`(?:${y}${$(t)}${a})?${_}${P}${r}${c}${P}`;case"**/.*":return`(?:${y}${$(t)}${a})?${r}${c}${P}`;default:{let T=/^(.*?)\.(\w+)$/.exec(k);if(!T)return;let A=I(T[1]);return A?A+r+T[2]:void 0}}},R=ce.removePrefix(s,S),W=I(R);return W&&t.strictSlashes!==!0&&(W+=`${a}?`),W};dn.exports=Xt});var hn=O(($c,un)=>{"use strict";var Hr=require("path"),Nr=cn(),Zt=pn(),Jt=ht(),Br=qe(),Or=s=>s&&typeof s=="object"&&!Array.isArray(s),V=(s,e,t=!1)=>{if(Array.isArray(s)){let u=s.map(l=>V(l,e,t));return l=>{for(let f of u){let m=f(l);if(m)return m}return!1}}let n=Or(s)&&s.tokens&&s.input;if(s===""||typeof s!="string"&&!n)throw new TypeError("Expected pattern to be a non-empty string");let o=e||{},i=Jt.isWindows(e),r=n?V.compileRe(s,e):V.makeRe(s,e,!1,!0),a=r.state;delete r.state;let c=()=>!1;if(o.ignore){let u={...e,ignore:null,onMatch:null,onResult:null};c=V(o.ignore,u,t)}let d=(u,h=!1)=>{let{isMatch:l,match:f,output:m}=V.test(u,r,e,{glob:s,posix:i}),y={glob:s,state:a,regex:r,posix:i,input:u,output:m,match:f,isMatch:l};return typeof o.onResult=="function"&&o.onResult(y),l===!1?(y.isMatch=!1,h?y:!1):c(u)?(typeof o.onIgnore=="function"&&o.onIgnore(y),y.isMatch=!1,h?y:!1):(typeof o.onMatch=="function"&&o.onMatch(y),h?y:!0)};return t&&(d.state=a),d};V.test=(s,e,t,{glob:n,posix:o}={})=>{if(typeof s!="string")throw new TypeError("Expected input to be a string");if(s==="")return{isMatch:!1,output:""};let i=t||{},r=i.format||(o?Jt.toPosixSlashes:null),a=s===n,c=a&&r?r(s):s;return a===!1&&(c=r?r(s):s,a=c===n),(a===!1||i.capture===!0)&&(i.matchBase===!0||i.basename===!0?a=V.matchBase(s,e,t,o):a=e.exec(c)),{isMatch:!!a,match:a,output:c}};V.matchBase=(s,e,t,n=Jt.isWindows(t))=>(e instanceof RegExp?e:V.makeRe(e,t)).test(Hr.basename(s));V.isMatch=(s,e,t)=>V(e,t)(s);V.parse=(s,e)=>Array.isArray(s)?s.map(t=>V.parse(t,e)):Zt(s,{...e,fastpaths:!1});V.scan=(s,e)=>Nr(s,e);V.compileRe=(s,e,t=!1,n=!1)=>{if(t===!0)return s.output;let o=e||{},i=o.contains?"":"^",r=o.contains?"":"$",a=`${i}(?:${s.output})${r}`;s&&s.negated===!0&&(a=`^(?!${a}).*$`);let c=V.toRegex(a,e);return n===!0&&(c.state=s),c};V.makeRe=(s,e={},t=!1,n=!1)=>{if(!s||typeof s!="string")throw new TypeError("Expected a non-empty string");let o={negated:!1,fastpaths:!0};return e.fastpaths!==!1&&(s[0]==="."||s[0]==="*")&&(o.output=Zt.fastpaths(s,e)),o.output||(o=Zt(s,e)),V.compileRe(o,e,t,n)};V.toRegex=(s,e)=>{try{let t=e||{};return new RegExp(s,t.flags||(t.nocase?"i":""))}catch(t){if(e&&e.debug===!0)throw t;return/$^/}};V.constants=Br;un.exports=V});var es=O((Mc,fn)=>{"use strict";fn.exports=hn()});var kn=O((Dc,_n)=>{"use strict";var ze=require("fs"),{Readable:jr}=require("stream"),Ge=require("path"),{promisify:yt}=require("util"),ts=es(),Wr=yt(ze.readdir),qr=yt(ze.stat),gn=yt(ze.lstat),Ur=yt(ze.realpath),Gr="!",yn="READDIRP_RECURSIVE_ERROR",zr=new Set(["ENOENT","EPERM","EACCES","ELOOP",yn]),ss="files",bn="directories",wt="files_directories",mt="all",mn=[ss,bn,wt,mt],Vr=s=>zr.has(s.code),[wn,Kr]=process.versions.node.split(".").slice(0,2).map(s=>Number.parseInt(s,10)),Yr=process.platform==="win32"&&(wn>10||wn===10&&Kr>=5),vn=s=>{if(s!==void 0){if(typeof s=="function")return s;if(typeof s=="string"){let e=ts(s.trim());return t=>e(t.basename)}if(Array.isArray(s)){let e=[],t=[];for(let n of s){let o=n.trim();o.charAt(0)===Gr?t.push(ts(o.slice(1))):e.push(ts(o))}return t.length>0?e.length>0?n=>e.some(o=>o(n.basename))&&!t.some(o=>o(n.basename)):n=>!t.some(o=>o(n.basename)):n=>e.some(o=>o(n.basename))}}},vt=class s extends jr{static get defaultOptions(){return{root:".",fileFilter:e=>!0,directoryFilter:e=>!0,type:ss,lstat:!1,depth:2147483648,alwaysStat:!1}}constructor(e={}){super({objectMode:!0,autoDestroy:!0,highWaterMark:e.highWaterMark||4096});let t={...s.defaultOptions,...e},{root:n,type:o}=t;this._fileFilter=vn(t.fileFilter),this._directoryFilter=vn(t.directoryFilter);let i=t.lstat?gn:qr;Yr?this._stat=r=>i(r,{bigint:!0}):this._stat=i,this._maxDepth=t.depth,this._wantsDir=[bn,wt,mt].includes(o),this._wantsFile=[ss,wt,mt].includes(o),this._wantsEverything=o===mt,this._root=Ge.resolve(n),this._isDirent="Dirent"in ze&&!t.alwaysStat,this._statsProp=this._isDirent?"dirent":"stats",this._rdOptions={encoding:"utf8",withFileTypes:this._isDirent},this.parents=[this._exploreDir(n,1)],this.reading=!1,this.parent=void 0}async _read(e){if(!this.reading){this.reading=!0;try{for(;!this.destroyed&&e>0;){let{path:t,depth:n,files:o=[]}=this.parent||{};if(o.length>0){let i=o.splice(0,e).map(r=>this._formatEntry(r,t));for(let r of await Promise.all(i)){if(this.destroyed)return;let a=await this._getEntryType(r);a==="directory"&&this._directoryFilter(r)?(n<=this._maxDepth&&this.parents.push(this._exploreDir(r.fullPath,n+1)),this._wantsDir&&(this.push(r),e--)):(a==="file"||this._includeAsFile(r))&&this._fileFilter(r)&&this._wantsFile&&(this.push(r),e--)}}else{let i=this.parents.pop();if(!i){this.push(null);break}if(this.parent=await i,this.destroyed)return}}}catch(t){this.destroy(t)}finally{this.reading=!1}}}async _exploreDir(e,t){let n;try{n=await Wr(e,this._rdOptions)}catch(o){this._onError(o)}return{files:n,depth:t,path:e}}async _formatEntry(e,t){let n;try{let o=this._isDirent?e.name:e,i=Ge.resolve(Ge.join(t,o));n={path:Ge.relative(this._root,i),fullPath:i,basename:o},n[this._statsProp]=this._isDirent?e:await this._stat(i)}catch(o){this._onError(o)}return n}_onError(e){Vr(e)&&!this.destroyed?this.emit("warn",e):this.destroy(e)}async _getEntryType(e){let t=e&&e[this._statsProp];if(t){if(t.isFile())return"file";if(t.isDirectory())return"directory";if(t&&t.isSymbolicLink()){let n=e.fullPath;try{let o=await Ur(n),i=await gn(o);if(i.isFile())return"file";if(i.isDirectory()){let r=o.length;if(n.startsWith(o)&&n.substr(r,1)===Ge.sep){let a=new Error(`Circular symlink detected: "${n}" points to "${o}"`);return a.code=yn,this._onError(a)}return"directory"}}catch(o){this._onError(o)}}}}_includeAsFile(e){let t=e&&e[this._statsProp];return t&&this._wantsEverything&&!t.isDirectory()}},$e=(s,e={})=>{let t=e.entryType||e.type;if(t==="both"&&(t=wt),t&&(e.type=t),s){if(typeof s!="string")throw new TypeError("readdirp: root argument must be a string. Usage: readdirp(root, options)");if(t&&!mn.includes(t))throw new Error(`readdirp: Invalid type passed. Use one of ${mn.join(", ")}`)}else throw new Error("readdirp: root argument is required. Usage: readdirp(root, options)");return e.root=s,new vt(e)},Qr=(s,e={})=>new Promise((t,n)=>{let o=[];$e(s,e).on("data",i=>o.push(i)).on("end",()=>t(o)).on("error",i=>n(i))});$e.promise=Qr;$e.ReaddirpStream=vt;$e.default=$e;_n.exports=$e});var ns=O((Fc,xn)=>{xn.exports=function(s,e){if(typeof s!="string")throw new TypeError("expected path to be a string");if(s==="\\"||s==="/")return"/";var t=s.length;if(t<=1)return s;var n="";if(t>4&&s[3]==="\\"){var o=s[2];(o==="?"||o===".")&&s.slice(0,2)==="\\\\"&&(s=s.slice(2),n="//")}var i=s.split(/[/\\]+/);return e!==!1&&i[i.length-1]===""&&i.pop(),n+i.join("/")}});var An=O((Rn,En)=>{"use strict";Object.defineProperty(Rn,"__esModule",{value:!0});var Sn=es(),Xr=ns(),Pn="!",Zr={returnIndex:!1},Jr=s=>Array.isArray(s)?s:[s],ei=(s,e)=>{if(typeof s=="function")return s;if(typeof s=="string"){let t=Sn(s,e);return n=>s===n||t(n)}return s instanceof RegExp?t=>s.test(t):t=>!1},Cn=(s,e,t,n)=>{let o=Array.isArray(t),i=o?t[0]:t;if(!o&&typeof i!="string")throw new TypeError("anymatch: second argument must be a string: got "+Object.prototype.toString.call(i));let r=Xr(i,!1);for(let c=0;c<e.length;c++){let d=e[c];if(d(r))return n?-1:!1}let a=o&&[r].concat(t.slice(1));for(let c=0;c<s.length;c++){let d=s[c];if(o?d(...a):d(r))return n?c:!0}return n?-1:!1},os=(s,e,t=Zr)=>{if(s==null)throw new TypeError("anymatch: specify first argument");let n=typeof t=="boolean"?{returnIndex:t}:t,o=n.returnIndex||!1,i=Jr(s),r=i.filter(c=>typeof c=="string"&&c.charAt(0)===Pn).map(c=>c.slice(1)).map(c=>Sn(c,n)),a=i.filter(c=>typeof c!="string"||typeof c=="string"&&c.charAt(0)!==Pn).map(c=>ei(c,n));return e==null?(c,d=!1)=>Cn(a,r,c,typeof d=="boolean"?d:!1):Cn(a,r,e,o)};os.default=os;En.exports=os});var In=O((Lc,Tn)=>{Tn.exports=function(e){if(typeof e!="string"||e==="")return!1;for(var t;t=/(\\).|([@?!+*]\(.*\))/g.exec(e);){if(t[2])return!0;e=e.slice(t.index+t[0].length)}return!1}});var rs=O((Hc,Mn)=>{var ti=In(),$n={"{":"}","(":")","[":"]"},si=function(s){if(s[0]==="!")return!0;for(var e=0,t=-2,n=-2,o=-2,i=-2,r=-2;e<s.length;){if(s[e]==="*"||s[e+1]==="?"&&/[\].+)]/.test(s[e])||n!==-1&&s[e]==="["&&s[e+1]!=="]"&&(n<e&&(n=s.indexOf("]",e)),n>e&&(r===-1||r>n||(r=s.indexOf("\\",e),r===-1||r>n)))||o!==-1&&s[e]==="{"&&s[e+1]!=="}"&&(o=s.indexOf("}",e),o>e&&(r=s.indexOf("\\",e),r===-1||r>o))||i!==-1&&s[e]==="("&&s[e+1]==="?"&&/[:!=]/.test(s[e+2])&&s[e+3]!==")"&&(i=s.indexOf(")",e),i>e&&(r=s.indexOf("\\",e),r===-1||r>i))||t!==-1&&s[e]==="("&&s[e+1]!=="|"&&(t<e&&(t=s.indexOf("|",e)),t!==-1&&s[t+1]!==")"&&(i=s.indexOf(")",t),i>t&&(r=s.indexOf("\\",t),r===-1||r>i))))return!0;if(s[e]==="\\"){var a=s[e+1];e+=2;var c=$n[a];if(c){var d=s.indexOf(c,e);d!==-1&&(e=d+1)}if(s[e]==="!")return!0}else e++}return!1},ni=function(s){if(s[0]==="!")return!0;for(var e=0;e<s.length;){if(/[*?{}()[\]]/.test(s[e]))return!0;if(s[e]==="\\"){var t=s[e+1];e+=2;var n=$n[t];if(n){var o=s.indexOf(n,e);o!==-1&&(e=o+1)}if(s[e]==="!")return!0}else e++}return!1};Mn.exports=function(e,t){if(typeof e!="string"||e==="")return!1;if(ti(e))return!0;var n=si;return t&&t.strict===!1&&(n=ni),n(e)}});var Fn=O((Nc,Dn)=>{"use strict";var oi=rs(),ri=require("path").posix.dirname,ii=require("os").platform()==="win32",is="/",ai=/\\/g,ci=/[\{\[].*[\}\]]$/,li=/(^|[^\\])([\{\[]|\([^\)]+$)/,di=/\\([\!\*\?\|\[\]\(\)\{\}])/g;Dn.exports=function(e,t){var n=Object.assign({flipBackslashes:!0},t);n.flipBackslashes&&ii&&e.indexOf(is)<0&&(e=e.replace(ai,is)),ci.test(e)&&(e+=is),e+="a";do e=ri(e);while(oi(e)||li.test(e));return e.replace(di,"$1")}});var bt=O(pe=>{"use strict";pe.isInteger=s=>typeof s=="number"?Number.isInteger(s):typeof s=="string"&&s.trim()!==""?Number.isInteger(Number(s)):!1;pe.find=(s,e)=>s.nodes.find(t=>t.type===e);pe.exceedsLimit=(s,e,t=1,n)=>n===!1||!pe.isInteger(s)||!pe.isInteger(e)?!1:(Number(e)-Number(s))/Number(t)>=n;pe.escapeNode=(s,e=0,t)=>{let n=s.nodes[e];n&&(t&&n.type===t||n.type==="open"||n.type==="close")&&n.escaped!==!0&&(n.value="\\"+n.value,n.escaped=!0)};pe.encloseBrace=s=>s.type!=="brace"?!1:s.commas>>0+s.ranges>>0===0?(s.invalid=!0,!0):!1;pe.isInvalidBrace=s=>s.type!=="brace"?!1:s.invalid===!0||s.dollar?!0:s.commas>>0+s.ranges>>0===0||s.open!==!0||s.close!==!0?(s.invalid=!0,!0):!1;pe.isOpenOrClose=s=>s.type==="open"||s.type==="close"?!0:s.open===!0||s.close===!0;pe.reduce=s=>s.reduce((e,t)=>(t.type==="text"&&e.push(t.value),t.type==="range"&&(t.type="text"),e),[]);pe.flatten=(...s)=>{let e=[],t=n=>{for(let o=0;o<n.length;o++){let i=n[o];if(Array.isArray(i)){t(i);continue}i!==void 0&&e.push(i)}return e};return t(s),e}});var _t=O((Oc,Hn)=>{"use strict";var Ln=bt();Hn.exports=(s,e={})=>{let t=(n,o={})=>{let i=e.escapeInvalid&&Ln.isInvalidBrace(o),r=n.invalid===!0&&e.escapeInvalid===!0,a="";if(n.value)return(i||r)&&Ln.isOpenOrClose(n)?"\\"+n.value:n.value;if(n.value)return n.value;if(n.nodes)for(let c of n.nodes)a+=t(c);return a};return t(s)}});var Bn=O((jc,Nn)=>{"use strict";Nn.exports=function(s){return typeof s=="number"?s-s===0:typeof s=="string"&&s.trim()!==""?Number.isFinite?Number.isFinite(+s):isFinite(+s):!1}});var Kn=O((Wc,Vn)=>{"use strict";var On=Bn(),xe=(s,e,t)=>{if(On(s)===!1)throw new TypeError("toRegexRange: expected the first argument to be a number");if(e===void 0||s===e)return String(s);if(On(e)===!1)throw new TypeError("toRegexRange: expected the second argument to be a number.");let n={relaxZeros:!0,...t};typeof n.strictZeros=="boolean"&&(n.relaxZeros=n.strictZeros===!1);let o=String(n.relaxZeros),i=String(n.shorthand),r=String(n.capture),a=String(n.wrap),c=s+":"+e+"="+o+i+r+a;if(xe.cache.hasOwnProperty(c))return xe.cache[c].result;let d=Math.min(s,e),u=Math.max(s,e);if(Math.abs(d-u)===1){let y=s+"|"+e;return n.capture?`(${y})`:n.wrap===!1?y:`(?:${y})`}let h=zn(s)||zn(e),l={min:s,max:e,a:d,b:u},f=[],m=[];if(h&&(l.isPadded=h,l.maxLen=String(l.max).length),d<0){let y=u<0?Math.abs(u):1;m=jn(y,Math.abs(d),l,n),d=l.a=0}return u>=0&&(f=jn(d,u,l,n)),l.negatives=m,l.positives=f,l.result=pi(m,f,n),n.capture===!0?l.result=`(${l.result})`:n.wrap!==!1&&f.length+m.length>1&&(l.result=`(?:${l.result})`),xe.cache[c]=l,l.result};function pi(s,e,t){let n=as(s,e,"-",!1,t)||[],o=as(e,s,"",!1,t)||[],i=as(s,e,"-?",!0,t)||[];return n.concat(i).concat(o).join("|")}function ui(s,e){let t=1,n=1,o=qn(s,t),i=new Set([e]);for(;s<=o&&o<=e;)i.add(o),t+=1,o=qn(s,t);for(o=Un(e+1,n)-1;s<o&&o<=e;)i.add(o),n+=1,o=Un(e+1,n)-1;return i=[...i],i.sort(gi),i}function hi(s,e,t){if(s===e)return{pattern:s,count:[],digits:0};let n=fi(s,e),o=n.length,i="",r=0;for(let a=0;a<o;a++){let[c,d]=n[a];c===d?i+=c:c!=="0"||d!=="9"?i+=mi(c,d,t):r++}return r&&(i+=t.shorthand===!0?"\\d":"[0-9]"),{pattern:i,count:[r],digits:o}}function jn(s,e,t,n){let o=ui(s,e),i=[],r=s,a;for(let c=0;c<o.length;c++){let d=o[c],u=hi(String(r),String(d),n),h="";if(!t.isPadded&&a&&a.pattern===u.pattern){a.count.length>1&&a.count.pop(),a.count.push(u.count[0]),a.string=a.pattern+Gn(a.count),r=d+1;continue}t.isPadded&&(h=wi(d,t,n)),u.string=h+u.pattern+Gn(u.count),i.push(u),r=d+1,a=u}return i}function as(s,e,t,n,o){let i=[];for(let r of s){let{string:a}=r;!n&&!Wn(e,"string",a)&&i.push(t+a),n&&Wn(e,"string",a)&&i.push(t+a)}return i}function fi(s,e){let t=[];for(let n=0;n<s.length;n++)t.push([s[n],e[n]]);return t}function gi(s,e){return s>e?1:e>s?-1:0}function Wn(s,e,t){return s.some(n=>n[e]===t)}function qn(s,e){return Number(String(s).slice(0,-e)+"9".repeat(e))}function Un(s,e){return s-s%Math.pow(10,e)}function Gn(s){let[e=0,t=""]=s;return t||e>1?`{${e+(t?","+t:"")}}`:""}function mi(s,e,t){return`[${s}${e-s===1?"":"-"}${e}]`}function zn(s){return/^-?(0+)\d/.test(s)}function wi(s,e,t){if(!e.isPadded)return s;let n=Math.abs(e.maxLen-String(s).length),o=t.relaxZeros!==!1;switch(n){case 0:return"";case 1:return o?"0?":"0";case 2:return o?"0{0,2}":"00";default:return o?`0{0,${n}}`:`0{${n}}`}}xe.cache={};xe.clearCache=()=>xe.cache={};Vn.exports=xe});var ds=O((qc,to)=>{"use strict";var vi=require("util"),Qn=Kn(),Yn=s=>s!==null&&typeof s=="object"&&!Array.isArray(s),yi=s=>e=>s===!0?Number(e):String(e),cs=s=>typeof s=="number"||typeof s=="string"&&s!=="",Ve=s=>Number.isInteger(+s),ls=s=>{let e=`${s}`,t=-1;if(e[0]==="-"&&(e=e.slice(1)),e==="0")return!1;for(;e[++t]==="0";);return t>0},bi=(s,e,t)=>typeof s=="string"||typeof e=="string"?!0:t.stringify===!0,_i=(s,e,t)=>{if(e>0){let n=s[0]==="-"?"-":"";n&&(s=s.slice(1)),s=n+s.padStart(n?e-1:e,"0")}return t===!1?String(s):s},xt=(s,e)=>{let t=s[0]==="-"?"-":"";for(t&&(s=s.slice(1),e--);s.length<e;)s="0"+s;return t?"-"+s:s},ki=(s,e,t)=>{s.negatives.sort((a,c)=>a<c?-1:a>c?1:0),s.positives.sort((a,c)=>a<c?-1:a>c?1:0);let n=e.capture?"":"?:",o="",i="",r;return s.positives.length&&(o=s.positives.map(a=>xt(String(a),t)).join("|")),s.negatives.length&&(i=`-(${n}${s.negatives.map(a=>xt(String(a),t)).join("|")})`),o&&i?r=`${o}|${i}`:r=o||i,e.wrap?`(${n}${r})`:r},Xn=(s,e,t,n)=>{if(t)return Qn(s,e,{wrap:!1,...n});let o=String.fromCharCode(s);if(s===e)return o;let i=String.fromCharCode(e);return`[${o}-${i}]`},Zn=(s,e,t)=>{if(Array.isArray(s)){let n=t.wrap===!0,o=t.capture?"":"?:";return n?`(${o}${s.join("|")})`:s.join("|")}return Qn(s,e,t)},Jn=(...s)=>new RangeError("Invalid range arguments: "+vi.inspect(...s)),eo=(s,e,t)=>{if(t.strictRanges===!0)throw Jn([s,e]);return[]},xi=(s,e)=>{if(e.strictRanges===!0)throw new TypeError(`Expected step "${s}" to be a number`);return[]},Pi=(s,e,t=1,n={})=>{let o=Number(s),i=Number(e);if(!Number.isInteger(o)||!Number.isInteger(i)){if(n.strictRanges===!0)throw Jn([s,e]);return[]}o===0&&(o=0),i===0&&(i=0);let r=o>i,a=String(s),c=String(e),d=String(t);t=Math.max(Math.abs(t),1);let u=ls(a)||ls(c)||ls(d),h=u?Math.max(a.length,c.length,d.length):0,l=u===!1&&bi(s,e,n)===!1,f=n.transform||yi(l);if(n.toRegex&&t===1)return Xn(xt(s,h),xt(e,h),!0,n);let m={negatives:[],positives:[]},y=S=>m[S<0?"negatives":"positives"].push(Math.abs(S)),_=[],C=0;for(;r?o>=i:o<=i;)n.toRegex===!0&&t>1?y(o):_.push(_i(f(o,C),h,l)),o=r?o-t:o+t,C++;return n.toRegex===!0?t>1?ki(m,n,h):Zn(_,null,{wrap:!1,...n}):_},Ci=(s,e,t=1,n={})=>{if(!Ve(s)&&s.length>1||!Ve(e)&&e.length>1)return eo(s,e,n);let o=n.transform||(l=>String.fromCharCode(l)),i=`${s}`.charCodeAt(0),r=`${e}`.charCodeAt(0),a=i>r,c=Math.min(i,r),d=Math.max(i,r);if(n.toRegex&&t===1)return Xn(c,d,!1,n);let u=[],h=0;for(;a?i>=r:i<=r;)u.push(o(i,h)),i=a?i-t:i+t,h++;return n.toRegex===!0?Zn(u,null,{wrap:!1,options:n}):u},kt=(s,e,t,n={})=>{if(e==null&&cs(s))return[s];if(!cs(s)||!cs(e))return eo(s,e,n);if(typeof t=="function")return kt(s,e,1,{transform:t});if(Yn(t))return kt(s,e,0,t);let o={...n};return o.capture===!0&&(o.wrap=!0),t=t||o.step||1,Ve(t)?Ve(s)&&Ve(e)?Pi(s,e,t,o):Ci(s,e,Math.max(Math.abs(t),1),o):t!=null&&!Yn(t)?xi(t,o):kt(s,e,1,t)};to.exports=kt});var oo=O((Uc,no)=>{"use strict";var Si=ds(),so=bt(),Ri=(s,e={})=>{let t=(n,o={})=>{let i=so.isInvalidBrace(o),r=n.invalid===!0&&e.escapeInvalid===!0,a=i===!0||r===!0,c=e.escapeInvalid===!0?"\\":"",d="";if(n.isOpen===!0)return c+n.value;if(n.isClose===!0)return console.log("node.isClose",c,n.value),c+n.value;if(n.type==="open")return a?c+n.value:"(";if(n.type==="close")return a?c+n.value:")";if(n.type==="comma")return n.prev.type==="comma"?"":a?n.value:"|";if(n.value)return n.value;if(n.nodes&&n.ranges>0){let u=so.reduce(n.nodes),h=Si(...u,{...e,wrap:!1,toRegex:!0,strictZeros:!0});if(h.length!==0)return u.length>1&&h.length>1?`(${h})`:h}if(n.nodes)for(let u of n.nodes)d+=t(u,n);return d};return t(s)};no.exports=Ri});var ao=O((Gc,io)=>{"use strict";var Ei=ds(),ro=_t(),Me=bt(),Pe=(s="",e="",t=!1)=>{let n=[];if(s=[].concat(s),e=[].concat(e),!e.length)return s;if(!s.length)return t?Me.flatten(e).map(o=>`{${o}}`):e;for(let o of s)if(Array.isArray(o))for(let i of o)n.push(Pe(i,e,t));else for(let i of e)t===!0&&typeof i=="string"&&(i=`{${i}}`),n.push(Array.isArray(i)?Pe(o,i,t):o+i);return Me.flatten(n)},Ai=(s,e={})=>{let t=e.rangeLimit===void 0?1e3:e.rangeLimit,n=(o,i={})=>{o.queue=[];let r=i,a=i.queue;for(;r.type!=="brace"&&r.type!=="root"&&r.parent;)r=r.parent,a=r.queue;if(o.invalid||o.dollar){a.push(Pe(a.pop(),ro(o,e)));return}if(o.type==="brace"&&o.invalid!==!0&&o.nodes.length===2){a.push(Pe(a.pop(),["{}"]));return}if(o.nodes&&o.ranges>0){let h=Me.reduce(o.nodes);if(Me.exceedsLimit(...h,e.step,t))throw new RangeError("expanded array length exceeds range limit. Use options.rangeLimit to increase or disable the limit.");let l=Ei(...h,e);l.length===0&&(l=ro(o,e)),a.push(Pe(a.pop(),l)),o.nodes=[];return}let c=Me.encloseBrace(o),d=o.queue,u=o;for(;u.type!=="brace"&&u.type!=="root"&&u.parent;)u=u.parent,d=u.queue;for(let h=0;h<o.nodes.length;h++){let l=o.nodes[h];if(l.type==="comma"&&o.type==="brace"){h===1&&d.push(""),d.push("");continue}if(l.type==="close"){a.push(Pe(a.pop(),d,c));continue}if(l.value&&l.type!=="open"){d.push(Pe(d.pop(),l.value));continue}l.nodes&&n(l,o)}return d};return Me.flatten(n(s))};io.exports=Ai});var lo=O((zc,co)=>{"use strict";co.exports={MAX_LENGTH:1e4,CHAR_0:"0",CHAR_9:"9",CHAR_UPPERCASE_A:"A",CHAR_LOWERCASE_A:"a",CHAR_UPPERCASE_Z:"Z",CHAR_LOWERCASE_Z:"z",CHAR_LEFT_PARENTHESES:"(",CHAR_RIGHT_PARENTHESES:")",CHAR_ASTERISK:"*",CHAR_AMPERSAND:"&",CHAR_AT:"@",CHAR_BACKSLASH:"\\",CHAR_BACKTICK:"`",CHAR_CARRIAGE_RETURN:"\r",CHAR_CIRCUMFLEX_ACCENT:"^",CHAR_COLON:":",CHAR_COMMA:",",CHAR_DOLLAR:"$",CHAR_DOT:".",CHAR_DOUBLE_QUOTE:'"',CHAR_EQUAL:"=",CHAR_EXCLAMATION_MARK:"!",CHAR_FORM_FEED:"\f",CHAR_FORWARD_SLASH:"/",CHAR_HASH:"#",CHAR_HYPHEN_MINUS:"-",CHAR_LEFT_ANGLE_BRACKET:"<",CHAR_LEFT_CURLY_BRACE:"{",CHAR_LEFT_SQUARE_BRACKET:"[",CHAR_LINE_FEED:`
`,CHAR_NO_BREAK_SPACE:"\xA0",CHAR_PERCENT:"%",CHAR_PLUS:"+",CHAR_QUESTION_MARK:"?",CHAR_RIGHT_ANGLE_BRACKET:">",CHAR_RIGHT_CURLY_BRACE:"}",CHAR_RIGHT_SQUARE_BRACKET:"]",CHAR_SEMICOLON:";",CHAR_SINGLE_QUOTE:"'",CHAR_SPACE:" ",CHAR_TAB:"	",CHAR_UNDERSCORE:"_",CHAR_VERTICAL_LINE:"|",CHAR_ZERO_WIDTH_NOBREAK_SPACE:"\uFEFF"}});var go=O((Vc,fo)=>{"use strict";var Ti=_t(),{MAX_LENGTH:po,CHAR_BACKSLASH:ps,CHAR_BACKTICK:Ii,CHAR_COMMA:$i,CHAR_DOT:Mi,CHAR_LEFT_PARENTHESES:Di,CHAR_RIGHT_PARENTHESES:Fi,CHAR_LEFT_CURLY_BRACE:Li,CHAR_RIGHT_CURLY_BRACE:Hi,CHAR_LEFT_SQUARE_BRACKET:uo,CHAR_RIGHT_SQUARE_BRACKET:ho,CHAR_DOUBLE_QUOTE:Ni,CHAR_SINGLE_QUOTE:Bi,CHAR_NO_BREAK_SPACE:Oi,CHAR_ZERO_WIDTH_NOBREAK_SPACE:ji}=lo(),Wi=(s,e={})=>{if(typeof s!="string")throw new TypeError("Expected a string");let t=e||{},n=typeof t.maxLength=="number"?Math.min(po,t.maxLength):po;if(s.length>n)throw new SyntaxError(`Input length (${s.length}), exceeds max characters (${n})`);let o={type:"root",input:s,nodes:[]},i=[o],r=o,a=o,c=0,d=s.length,u=0,h=0,l,f=()=>s[u++],m=y=>{if(y.type==="text"&&a.type==="dot"&&(a.type="text"),a&&a.type==="text"&&y.type==="text"){a.value+=y.value;return}return r.nodes.push(y),y.parent=r,y.prev=a,a=y,y};for(m({type:"bos"});u<d;)if(r=i[i.length-1],l=f(),!(l===ji||l===Oi)){if(l===ps){m({type:"text",value:(e.keepEscaping?l:"")+f()});continue}if(l===ho){m({type:"text",value:"\\"+l});continue}if(l===uo){c++;let y;for(;u<d&&(y=f());){if(l+=y,y===uo){c++;continue}if(y===ps){l+=f();continue}if(y===ho&&(c--,c===0))break}m({type:"text",value:l});continue}if(l===Di){r=m({type:"paren",nodes:[]}),i.push(r),m({type:"text",value:l});continue}if(l===Fi){if(r.type!=="paren"){m({type:"text",value:l});continue}r=i.pop(),m({type:"text",value:l}),r=i[i.length-1];continue}if(l===Ni||l===Bi||l===Ii){let y=l,_;for(e.keepQuotes!==!0&&(l="");u<d&&(_=f());){if(_===ps){l+=_+f();continue}if(_===y){e.keepQuotes===!0&&(l+=_);break}l+=_}m({type:"text",value:l});continue}if(l===Li){h++;let _={type:"brace",open:!0,close:!1,dollar:a.value&&a.value.slice(-1)==="$"||r.dollar===!0,depth:h,commas:0,ranges:0,nodes:[]};r=m(_),i.push(r),m({type:"open",value:l});continue}if(l===Hi){if(r.type!=="brace"){m({type:"text",value:l});continue}let y="close";r=i.pop(),r.close=!0,m({type:y,value:l}),h--,r=i[i.length-1];continue}if(l===$i&&h>0){if(r.ranges>0){r.ranges=0;let y=r.nodes.shift();r.nodes=[y,{type:"text",value:Ti(r)}]}m({type:"comma",value:l}),r.commas++;continue}if(l===Mi&&h>0&&r.commas===0){let y=r.nodes;if(h===0||y.length===0){m({type:"text",value:l});continue}if(a.type==="dot"){if(r.range=[],a.value+=l,a.type="range",r.nodes.length!==3&&r.nodes.length!==5){r.invalid=!0,r.ranges=0,a.type="text";continue}r.ranges++,r.args=[];continue}if(a.type==="range"){y.pop();let _=y[y.length-1];_.value+=a.value+l,a=_,r.ranges--;continue}m({type:"dot",value:l});continue}m({type:"text",value:l})}do if(r=i.pop(),r.type!=="root"){r.nodes.forEach(C=>{C.nodes||(C.type==="open"&&(C.isOpen=!0),C.type==="close"&&(C.isClose=!0),C.nodes||(C.type="text"),C.invalid=!0)});let y=i[i.length-1],_=y.nodes.indexOf(r);y.nodes.splice(_,1,...r.nodes)}while(i.length>0);return m({type:"eos"}),o};fo.exports=Wi});var vo=O((Kc,wo)=>{"use strict";var mo=_t(),qi=oo(),Ui=ao(),Gi=go(),le=(s,e={})=>{let t=[];if(Array.isArray(s))for(let n of s){let o=le.create(n,e);Array.isArray(o)?t.push(...o):t.push(o)}else t=[].concat(le.create(s,e));return e&&e.expand===!0&&e.nodupes===!0&&(t=[...new Set(t)]),t};le.parse=(s,e={})=>Gi(s,e);le.stringify=(s,e={})=>mo(typeof s=="string"?le.parse(s,e):s,e);le.compile=(s,e={})=>(typeof s=="string"&&(s=le.parse(s,e)),qi(s,e));le.expand=(s,e={})=>{typeof s=="string"&&(s=le.parse(s,e));let t=Ui(s,e);return e.noempty===!0&&(t=t.filter(Boolean)),e.nodupes===!0&&(t=[...new Set(t)]),t};le.create=(s,e={})=>s===""||s.length<3?[s]:e.expand!==!0?le.compile(s,e):le.expand(s,e);wo.exports=le});var yo=O((Yc,zi)=>{zi.exports=["3dm","3ds","3g2","3gp","7z","a","aac","adp","afdesign","afphoto","afpub","ai","aif","aiff","alz","ape","apk","appimage","ar","arj","asf","au","avi","bak","baml","bh","bin","bk","bmp","btif","bz2","bzip2","cab","caf","cgm","class","cmx","cpio","cr2","cur","dat","dcm","deb","dex","djvu","dll","dmg","dng","doc","docm","docx","dot","dotm","dra","DS_Store","dsk","dts","dtshd","dvb","dwg","dxf","ecelp4800","ecelp7470","ecelp9600","egg","eol","eot","epub","exe","f4v","fbs","fh","fla","flac","flatpak","fli","flv","fpx","fst","fvt","g3","gh","gif","graffle","gz","gzip","h261","h263","h264","icns","ico","ief","img","ipa","iso","jar","jpeg","jpg","jpgv","jpm","jxr","key","ktx","lha","lib","lvp","lz","lzh","lzma","lzo","m3u","m4a","m4v","mar","mdi","mht","mid","midi","mj2","mka","mkv","mmr","mng","mobi","mov","movie","mp3","mp4","mp4a","mpeg","mpg","mpga","mxu","nef","npx","numbers","nupkg","o","odp","ods","odt","oga","ogg","ogv","otf","ott","pages","pbm","pcx","pdb","pdf","pea","pgm","pic","png","pnm","pot","potm","potx","ppa","ppam","ppm","pps","ppsm","ppsx","ppt","pptm","pptx","psd","pya","pyc","pyo","pyv","qt","rar","ras","raw","resources","rgb","rip","rlc","rmf","rmvb","rpm","rtf","rz","s3m","s7z","scpt","sgi","shar","snap","sil","sketch","slk","smv","snk","so","stl","suo","sub","swf","tar","tbz","tbz2","tga","tgz","thmx","tif","tiff","tlz","ttc","ttf","txz","udf","uvh","uvi","uvm","uvp","uvs","uvu","viv","vob","war","wav","wax","wbmp","wdp","weba","webm","webp","whl","wim","wm","wma","wmv","wmx","woff","woff2","wrm","wvx","xbm","xif","xla","xlam","xls","xlsb","xlsm","xlsx","xlt","xltm","xltx","xm","xmind","xpi","xpm","xwd","xz","z","zip","zipx"]});var _o=O((Qc,bo)=>{bo.exports=yo()});var xo=O((Xc,ko)=>{"use strict";var Vi=require("path"),Ki=_o(),Yi=new Set(Ki);ko.exports=s=>Yi.has(Vi.extname(s).slice(1).toLowerCase())});var Pt=O(E=>{"use strict";var{sep:Qi}=require("path"),{platform:us}=process,Xi=require("os");E.EV_ALL="all";E.EV_READY="ready";E.EV_ADD="add";E.EV_CHANGE="change";E.EV_ADD_DIR="addDir";E.EV_UNLINK="unlink";E.EV_UNLINK_DIR="unlinkDir";E.EV_RAW="raw";E.EV_ERROR="error";E.STR_DATA="data";E.STR_END="end";E.STR_CLOSE="close";E.FSEVENT_CREATED="created";E.FSEVENT_MODIFIED="modified";E.FSEVENT_DELETED="deleted";E.FSEVENT_MOVED="moved";E.FSEVENT_CLONED="cloned";E.FSEVENT_UNKNOWN="unknown";E.FSEVENT_FLAG_MUST_SCAN_SUBDIRS=1;E.FSEVENT_TYPE_FILE="file";E.FSEVENT_TYPE_DIRECTORY="directory";E.FSEVENT_TYPE_SYMLINK="symlink";E.KEY_LISTENERS="listeners";E.KEY_ERR="errHandlers";E.KEY_RAW="rawEmitters";E.HANDLER_KEYS=[E.KEY_LISTENERS,E.KEY_ERR,E.KEY_RAW];E.DOT_SLASH=`.${Qi}`;E.BACK_SLASH_RE=/\\/g;E.DOUBLE_SLASH_RE=/\/\//;E.SLASH_OR_BACK_SLASH_RE=/[/\\]/;E.DOT_RE=/\..*\.(sw[px])$|~$|\.subl.*\.tmp/;E.REPLACER_RE=/^\.[/\\]/;E.SLASH="/";E.SLASH_SLASH="//";E.BRACE_START="{";E.BANG="!";E.ONE_DOT=".";E.TWO_DOTS="..";E.STAR="*";E.GLOBSTAR="**";E.ROOT_GLOBSTAR="/**/*";E.SLASH_GLOBSTAR="/**";E.DIR_SUFFIX="Dir";E.ANYMATCH_OPTS={dot:!0};E.STRING_TYPE="string";E.FUNCTION_TYPE="function";E.EMPTY_STR="";E.EMPTY_FN=()=>{};E.IDENTITY_FN=s=>s;E.isWindows=us==="win32";E.isMacos=us==="darwin";E.isLinux=us==="linux";E.isIBMi=Xi.type()==="OS400"});var Ao=O((Jc,Eo)=>{"use strict";var _e=require("fs"),X=require("path"),{promisify:Xe}=require("util"),Zi=xo(),{isWindows:Ji,isLinux:ea,EMPTY_FN:ta,EMPTY_STR:sa,KEY_LISTENERS:De,KEY_ERR:hs,KEY_RAW:Ke,HANDLER_KEYS:na,EV_CHANGE:St,EV_ADD:Ct,EV_ADD_DIR:oa,EV_ERROR:Co,STR_DATA:ra,STR_END:ia,BRACE_START:aa,STAR:ca}=Pt(),la="watch",da=Xe(_e.open),So=Xe(_e.stat),pa=Xe(_e.lstat),ua=Xe(_e.close),fs=Xe(_e.realpath),ha={lstat:pa,stat:So},ms=(s,e)=>{s instanceof Set?s.forEach(e):e(s)},Ye=(s,e,t)=>{let n=s[e];n instanceof Set||(s[e]=n=new Set([n])),n.add(t)},fa=s=>e=>{let t=s[e];t instanceof Set?t.clear():delete s[e]},Qe=(s,e,t)=>{let n=s[e];n instanceof Set?n.delete(t):n===t&&delete s[e]},Ro=s=>s instanceof Set?s.size===0:!s,Rt=new Map;function Po(s,e,t,n,o){let i=(r,a)=>{t(s),o(r,a,{watchedPath:s}),a&&s!==a&&Et(X.resolve(s,a),De,X.join(s,a))};try{return _e.watch(s,e,i)}catch(r){n(r)}}var Et=(s,e,t,n,o)=>{let i=Rt.get(s);i&&ms(i[e],r=>{r(t,n,o)})},ga=(s,e,t,n)=>{let{listener:o,errHandler:i,rawEmitter:r}=n,a=Rt.get(e),c;if(!t.persistent)return c=Po(s,t,o,i,r),c.close.bind(c);if(a)Ye(a,De,o),Ye(a,hs,i),Ye(a,Ke,r);else{if(c=Po(s,t,Et.bind(null,e,De),i,Et.bind(null,e,Ke)),!c)return;c.on(Co,async d=>{let u=Et.bind(null,e,hs);if(a.watcherUnusable=!0,Ji&&d.code==="EPERM")try{let h=await da(s,"r");await ua(h),u(d)}catch{}else u(d)}),a={listeners:o,errHandlers:i,rawEmitters:r,watcher:c},Rt.set(e,a)}return()=>{Qe(a,De,o),Qe(a,hs,i),Qe(a,Ke,r),Ro(a.listeners)&&(a.watcher.close(),Rt.delete(e),na.forEach(fa(a)),a.watcher=void 0,Object.freeze(a))}},gs=new Map,ma=(s,e,t,n)=>{let{listener:o,rawEmitter:i}=n,r=gs.get(e),a=new Set,c=new Set,d=r&&r.options;return d&&(d.persistent<t.persistent||d.interval>t.interval)&&(a=r.listeners,c=r.rawEmitters,_e.unwatchFile(e),r=void 0),r?(Ye(r,De,o),Ye(r,Ke,i)):(r={listeners:o,rawEmitters:i,options:t,watcher:_e.watchFile(e,t,(u,h)=>{ms(r.rawEmitters,f=>{f(St,e,{curr:u,prev:h})});let l=u.mtimeMs;(u.size!==h.size||l>h.mtimeMs||l===0)&&ms(r.listeners,f=>f(s,u))})},gs.set(e,r)),()=>{Qe(r,De,o),Qe(r,Ke,i),Ro(r.listeners)&&(gs.delete(e),_e.unwatchFile(e),r.options=r.watcher=void 0,Object.freeze(r))}},ws=class{constructor(e){this.fsw=e,this._boundHandleError=t=>e._handleError(t)}_watchWithNodeFs(e,t){let n=this.fsw.options,o=X.dirname(e),i=X.basename(e);this.fsw._getWatchedDir(o).add(i);let a=X.resolve(e),c={persistent:n.persistent};t||(t=ta);let d;return n.usePolling?(c.interval=n.enableBinaryInterval&&Zi(i)?n.binaryInterval:n.interval,d=ma(e,a,c,{listener:t,rawEmitter:this.fsw._emitRaw})):d=ga(e,a,c,{listener:t,errHandler:this._boundHandleError,rawEmitter:this.fsw._emitRaw}),d}_handleFile(e,t,n){if(this.fsw.closed)return;let o=X.dirname(e),i=X.basename(e),r=this.fsw._getWatchedDir(o),a=t;if(r.has(i))return;let c=async(u,h)=>{if(this.fsw._throttle(la,e,5)){if(!h||h.mtimeMs===0)try{let l=await So(e);if(this.fsw.closed)return;let f=l.atimeMs,m=l.mtimeMs;(!f||f<=m||m!==a.mtimeMs)&&this.fsw._emit(St,e,l),ea&&a.ino!==l.ino?(this.fsw._closeFile(u),a=l,this.fsw._addPathCloser(u,this._watchWithNodeFs(e,c))):a=l}catch{this.fsw._remove(o,i)}else if(r.has(i)){let l=h.atimeMs,f=h.mtimeMs;(!l||l<=f||f!==a.mtimeMs)&&this.fsw._emit(St,e,h),a=h}}},d=this._watchWithNodeFs(e,c);if(!(n&&this.fsw.options.ignoreInitial)&&this.fsw._isntIgnored(e)){if(!this.fsw._throttle(Ct,e,0))return;this.fsw._emit(Ct,e,t)}return d}async _handleSymlink(e,t,n,o){if(this.fsw.closed)return;let i=e.fullPath,r=this.fsw._getWatchedDir(t);if(!this.fsw.options.followSymlinks){this.fsw._incrReadyCount();let a;try{a=await fs(n)}catch{return this.fsw._emitReady(),!0}return this.fsw.closed?void 0:(r.has(o)?this.fsw._symlinkPaths.get(i)!==a&&(this.fsw._symlinkPaths.set(i,a),this.fsw._emit(St,n,e.stats)):(r.add(o),this.fsw._symlinkPaths.set(i,a),this.fsw._emit(Ct,n,e.stats)),this.fsw._emitReady(),!0)}if(this.fsw._symlinkPaths.has(i))return!0;this.fsw._symlinkPaths.set(i,!0)}_handleRead(e,t,n,o,i,r,a){if(e=X.join(e,sa),!n.hasGlob&&(a=this.fsw._throttle("readdir",e,1e3),!a))return;let c=this.fsw._getWatchedDir(n.path),d=new Set,u=this.fsw._readdirp(e,{fileFilter:h=>n.filterPath(h),directoryFilter:h=>n.filterDir(h),depth:0}).on(ra,async h=>{if(this.fsw.closed){u=void 0;return}let l=h.path,f=X.join(e,l);if(d.add(l),!(h.stats.isSymbolicLink()&&await this._handleSymlink(h,e,f,l))){if(this.fsw.closed){u=void 0;return}(l===o||!o&&!c.has(l))&&(this.fsw._incrReadyCount(),f=X.join(i,X.relative(i,f)),this._addToNodeFs(f,t,n,r+1))}}).on(Co,this._boundHandleError);return new Promise(h=>u.once(ia,()=>{if(this.fsw.closed){u=void 0;return}let l=a?a.clear():!1;h(),c.getChildren().filter(f=>f!==e&&!d.has(f)&&(!n.hasGlob||n.filterPath({fullPath:X.resolve(e,f)}))).forEach(f=>{this.fsw._remove(e,f)}),u=void 0,l&&this._handleRead(e,!1,n,o,i,r,a)}))}async _handleDir(e,t,n,o,i,r,a){let c=this.fsw._getWatchedDir(X.dirname(e)),d=c.has(X.basename(e));!(n&&this.fsw.options.ignoreInitial)&&!i&&!d&&(!r.hasGlob||r.globFilter(e))&&this.fsw._emit(oa,e,t),c.add(X.basename(e)),this.fsw._getWatchedDir(e);let u,h,l=this.fsw.options.depth;if((l==null||o<=l)&&!this.fsw._symlinkPaths.has(a)){if(!i&&(await this._handleRead(e,n,r,i,e,o,u),this.fsw.closed))return;h=this._watchWithNodeFs(e,(f,m)=>{m&&m.mtimeMs===0||this._handleRead(f,!1,r,i,e,o,u)})}return h}async _addToNodeFs(e,t,n,o,i){let r=this.fsw._emitReady;if(this.fsw._isIgnored(e)||this.fsw.closed)return r(),!1;let a=this.fsw._getWatchHelpers(e,o);!a.hasGlob&&n&&(a.hasGlob=n.hasGlob,a.globFilter=n.globFilter,a.filterPath=c=>n.filterPath(c),a.filterDir=c=>n.filterDir(c));try{let c=await ha[a.statMethod](a.watchPath);if(this.fsw.closed)return;if(this.fsw._isIgnored(a.watchPath,c))return r(),!1;let d=this.fsw.options.followSymlinks&&!e.includes(ca)&&!e.includes(aa),u;if(c.isDirectory()){let h=X.resolve(e),l=d?await fs(e):e;if(this.fsw.closed||(u=await this._handleDir(a.watchPath,c,t,o,i,a,l),this.fsw.closed))return;h!==l&&l!==void 0&&this.fsw._symlinkPaths.set(h,l)}else if(c.isSymbolicLink()){let h=d?await fs(e):e;if(this.fsw.closed)return;let l=X.dirname(a.watchPath);if(this.fsw._getWatchedDir(l).add(a.watchPath),this.fsw._emit(Ct,a.watchPath,c),u=await this._handleDir(l,c,t,o,e,a,h),this.fsw.closed)return;h!==void 0&&this.fsw._symlinkPaths.set(X.resolve(e),h)}else u=this._handleFile(a.watchPath,c,t);return r(),this.fsw._addPathCloser(e,u),!1}catch(c){if(this.fsw._handleError(c))return r(),e}}};Eo.exports=ws});var Lo=O((el,Cs)=>{"use strict";var xs=require("fs"),Z=require("path"),{promisify:Ps}=require("util"),Fe;try{Fe=require("fsevents")}catch(s){process.env.CHOKIDAR_PRINT_FSEVENTS_REQUIRE_ERROR&&console.error(s)}if(Fe){let s=process.version.match(/v(\d+)\.(\d+)/);if(s&&s[1]&&s[2]){let e=Number.parseInt(s[1],10),t=Number.parseInt(s[2],10);e===8&&t<16&&(Fe=void 0)}}var{EV_ADD:vs,EV_CHANGE:wa,EV_ADD_DIR:To,EV_UNLINK:At,EV_ERROR:va,STR_DATA:ya,STR_END:ba,FSEVENT_CREATED:_a,FSEVENT_MODIFIED:ka,FSEVENT_DELETED:xa,FSEVENT_MOVED:Pa,FSEVENT_UNKNOWN:Ca,FSEVENT_FLAG_MUST_SCAN_SUBDIRS:Sa,FSEVENT_TYPE_FILE:Ra,FSEVENT_TYPE_DIRECTORY:Ze,FSEVENT_TYPE_SYMLINK:Fo,ROOT_GLOBSTAR:Io,DIR_SUFFIX:Ea,DOT_SLASH:$o,FUNCTION_TYPE:ys,EMPTY_FN:Aa,IDENTITY_FN:Ta}=Pt(),Ia=s=>isNaN(s)?{}:{depth:s},_s=Ps(xs.stat),$a=Ps(xs.lstat),Mo=Ps(xs.realpath),Ma={stat:_s,lstat:$a},Ce=new Map,Da=10,Fa=new Set([69888,70400,71424,72704,73472,131328,131840,262912]),La=(s,e)=>({stop:Fe.watch(s,e)});function Ha(s,e,t,n){let o=Z.extname(e)?Z.dirname(e):e,i=Z.dirname(o),r=Ce.get(o);Na(i)&&(o=i);let a=Z.resolve(s),c=a!==e,d=(h,l,f)=>{c&&(h=h.replace(e,a)),(h===a||!h.indexOf(a+Z.sep))&&t(h,l,f)},u=!1;for(let h of Ce.keys())if(e.indexOf(Z.resolve(h)+Z.sep)===0){o=h,r=Ce.get(o),u=!0;break}return r||u?r.listeners.add(d):(r={listeners:new Set([d]),rawEmitter:n,watcher:La(o,(h,l)=>{if(!r.listeners.size||l&Sa)return;let f=Fe.getInfo(h,l);r.listeners.forEach(m=>{m(h,l,f)}),r.rawEmitter(f.event,h,f)})},Ce.set(o,r)),()=>{let h=r.listeners;if(h.delete(d),!h.size&&(Ce.delete(o),r.watcher))return r.watcher.stop().then(()=>{r.rawEmitter=r.watcher=void 0,Object.freeze(r)})}}var Na=s=>{let e=0;for(let t of Ce.keys())if(t.indexOf(s)===0&&(e++,e>=Da))return!0;return!1},Ba=()=>Fe&&Ce.size<128,bs=(s,e)=>{let t=0;for(;!s.indexOf(e)&&(s=Z.dirname(s))!==e;)t++;return t},Do=(s,e)=>s.type===Ze&&e.isDirectory()||s.type===Fo&&e.isSymbolicLink()||s.type===Ra&&e.isFile(),ks=class{constructor(e){this.fsw=e}checkIgnored(e,t){let n=this.fsw._ignoredPaths;if(this.fsw._isIgnored(e,t))return n.add(e),t&&t.isDirectory()&&n.add(e+Io),!0;n.delete(e),n.delete(e+Io)}addOrChange(e,t,n,o,i,r,a,c){let d=i.has(r)?wa:vs;this.handleEvent(d,e,t,n,o,i,r,a,c)}async checkExists(e,t,n,o,i,r,a,c){try{let d=await _s(e);if(this.fsw.closed)return;Do(a,d)?this.addOrChange(e,t,n,o,i,r,a,c):this.handleEvent(At,e,t,n,o,i,r,a,c)}catch(d){d.code==="EACCES"?this.addOrChange(e,t,n,o,i,r,a,c):this.handleEvent(At,e,t,n,o,i,r,a,c)}}handleEvent(e,t,n,o,i,r,a,c,d){if(!(this.fsw.closed||this.checkIgnored(t)))if(e===At){let u=c.type===Ze;(u||r.has(a))&&this.fsw._remove(i,a,u)}else{if(e===vs){if(c.type===Ze&&this.fsw._getWatchedDir(t),c.type===Fo&&d.followSymlinks){let h=d.depth===void 0?void 0:bs(n,o)+1;return this._addToFsEvents(t,!1,!0,h)}this.fsw._getWatchedDir(i).add(a)}let u=c.type===Ze?e+Ea:e;this.fsw._emit(u,t),u===To&&this._addToFsEvents(t,!1,!0)}}_watchWithFsEvents(e,t,n,o){if(this.fsw.closed||this.fsw._isIgnored(e))return;let i=this.fsw.options,a=Ha(e,t,async(c,d,u)=>{if(this.fsw.closed||i.depth!==void 0&&bs(c,t)>i.depth)return;let h=n(Z.join(e,Z.relative(e,c)));if(o&&!o(h))return;let l=Z.dirname(h),f=Z.basename(h),m=this.fsw._getWatchedDir(u.type===Ze?h:l);if(Fa.has(d)||u.event===Ca)if(typeof i.ignored===ys){let y;try{y=await _s(h)}catch{}if(this.fsw.closed||this.checkIgnored(h,y))return;Do(u,y)?this.addOrChange(h,c,t,l,m,f,u,i):this.handleEvent(At,h,c,t,l,m,f,u,i)}else this.checkExists(h,c,t,l,m,f,u,i);else switch(u.event){case _a:case ka:return this.addOrChange(h,c,t,l,m,f,u,i);case xa:case Pa:return this.checkExists(h,c,t,l,m,f,u,i)}},this.fsw._emitRaw);return this.fsw._emitReady(),a}async _handleFsEventsSymlink(e,t,n,o){if(!(this.fsw.closed||this.fsw._symlinkPaths.has(t))){this.fsw._symlinkPaths.set(t,!0),this.fsw._incrReadyCount();try{let i=await Mo(e);if(this.fsw.closed)return;if(this.fsw._isIgnored(i))return this.fsw._emitReady();this.fsw._incrReadyCount(),this._addToFsEvents(i||e,r=>{let a=e;return i&&i!==$o?a=r.replace(i,e):r!==$o&&(a=Z.join(e,r)),n(a)},!1,o)}catch(i){if(this.fsw._handleError(i))return this.fsw._emitReady()}}}emitAdd(e,t,n,o,i){let r=n(e),a=t.isDirectory(),c=this.fsw._getWatchedDir(Z.dirname(r)),d=Z.basename(r);a&&this.fsw._getWatchedDir(r),!c.has(d)&&(c.add(d),(!o.ignoreInitial||i===!0)&&this.fsw._emit(a?To:vs,r,t))}initWatch(e,t,n,o){if(this.fsw.closed)return;let i=this._watchWithFsEvents(n.watchPath,Z.resolve(e||n.watchPath),o,n.globFilter);this.fsw._addPathCloser(t,i)}async _addToFsEvents(e,t,n,o){if(this.fsw.closed)return;let i=this.fsw.options,r=typeof t===ys?t:Ta,a=this.fsw._getWatchHelpers(e);try{let c=await Ma[a.statMethod](a.watchPath);if(this.fsw.closed)return;if(this.fsw._isIgnored(a.watchPath,c))throw null;if(c.isDirectory()){if(a.globFilter||this.emitAdd(r(e),c,r,i,n),o&&o>i.depth)return;this.fsw._readdirp(a.watchPath,{fileFilter:d=>a.filterPath(d),directoryFilter:d=>a.filterDir(d),...Ia(i.depth-(o||0))}).on(ya,d=>{if(this.fsw.closed||d.stats.isDirectory()&&!a.filterPath(d))return;let u=Z.join(a.watchPath,d.path),{fullPath:h}=d;if(a.followSymlinks&&d.stats.isSymbolicLink()){let l=i.depth===void 0?void 0:bs(u,Z.resolve(a.watchPath))+1;this._handleFsEventsSymlink(u,h,r,l)}else this.emitAdd(u,d.stats,r,i,n)}).on(va,Aa).on(ba,()=>{this.fsw._emitReady()})}else this.emitAdd(a.watchPath,c,r,i,n),this.fsw._emitReady()}catch(c){(!c||this.fsw._handleError(c))&&(this.fsw._emitReady(),this.fsw._emitReady())}if(i.persistent&&n!==!0)if(typeof t===ys)this.initWatch(void 0,e,a,r);else{let c;try{c=await Mo(a.watchPath)}catch{}this.initWatch(c,e,a,r)}}};Cs.exports=ks;Cs.exports.canUse=Ba});var js=O(Os=>{"use strict";var{EventEmitter:Oa}=require("events"),Ns=require("fs"),j=require("path"),{promisify:qo}=require("util"),ja=kn(),Is=An().default,Wa=Fn(),Ss=rs(),qa=vo(),Ua=ns(),Ga=Ao(),Ho=Lo(),{EV_ALL:Rs,EV_READY:za,EV_ADD:Tt,EV_CHANGE:Je,EV_UNLINK:No,EV_ADD_DIR:Va,EV_UNLINK_DIR:Ka,EV_RAW:Ya,EV_ERROR:Es,STR_CLOSE:Qa,STR_END:Xa,BACK_SLASH_RE:Za,DOUBLE_SLASH_RE:Bo,SLASH_OR_BACK_SLASH_RE:Ja,DOT_RE:ec,REPLACER_RE:tc,SLASH:As,SLASH_SLASH:sc,BRACE_START:nc,BANG:$s,ONE_DOT:Uo,TWO_DOTS:oc,GLOBSTAR:rc,SLASH_GLOBSTAR:Ts,ANYMATCH_OPTS:Ms,STRING_TYPE:Bs,FUNCTION_TYPE:ic,EMPTY_STR:Ds,EMPTY_FN:ac,isWindows:cc,isMacos:lc,isIBMi:dc}=Pt(),pc=qo(Ns.stat),uc=qo(Ns.readdir),Fs=(s=[])=>Array.isArray(s)?s:[s],Go=(s,e=[])=>(s.forEach(t=>{Array.isArray(t)?Go(t,e):e.push(t)}),e),Oo=s=>{let e=Go(Fs(s));if(!e.every(t=>typeof t===Bs))throw new TypeError(`Non-string provided as watch path: ${e}`);return e.map(zo)},jo=s=>{let e=s.replace(Za,As),t=!1;for(e.startsWith(sc)&&(t=!0);e.match(Bo);)e=e.replace(Bo,As);return t&&(e=As+e),e},zo=s=>jo(j.normalize(jo(s))),Wo=(s=Ds)=>e=>typeof e!==Bs?e:zo(j.isAbsolute(e)?e:j.join(s,e)),hc=(s,e)=>j.isAbsolute(s)?s:s.startsWith($s)?$s+j.join(e,s.slice(1)):j.join(e,s),he=(s,e)=>s[e]===void 0,Ls=class{constructor(e,t){this.path=e,this._removeWatcher=t,this.items=new Set}add(e){let{items:t}=this;t&&e!==Uo&&e!==oc&&t.add(e)}async remove(e){let{items:t}=this;if(!t||(t.delete(e),t.size>0))return;let n=this.path;try{await uc(n)}catch{this._removeWatcher&&this._removeWatcher(j.dirname(n),j.basename(n))}}has(e){let{items:t}=this;if(t)return t.has(e)}getChildren(){let{items:e}=this;if(e)return[...e.values()]}dispose(){this.items.clear(),delete this.path,delete this._removeWatcher,delete this.items,Object.freeze(this)}},fc="stat",gc="lstat",Hs=class{constructor(e,t,n,o){this.fsw=o,this.path=e=e.replace(tc,Ds),this.watchPath=t,this.fullWatchPath=j.resolve(t),this.hasGlob=t!==e,e===Ds&&(this.hasGlob=!1),this.globSymlink=this.hasGlob&&n?void 0:!1,this.globFilter=this.hasGlob?Is(e,void 0,Ms):!1,this.dirParts=this.getDirParts(e),this.dirParts.forEach(i=>{i.length>1&&i.pop()}),this.followSymlinks=n,this.statMethod=n?fc:gc}checkGlobSymlink(e){return this.globSymlink===void 0&&(this.globSymlink=e.fullParentDir===this.fullWatchPath?!1:{realPath:e.fullParentDir,linkPath:this.fullWatchPath}),this.globSymlink?e.fullPath.replace(this.globSymlink.realPath,this.globSymlink.linkPath):e.fullPath}entryPath(e){return j.join(this.watchPath,j.relative(this.watchPath,this.checkGlobSymlink(e)))}filterPath(e){let{stats:t}=e;if(t&&t.isSymbolicLink())return this.filterDir(e);let n=this.entryPath(e);return(this.hasGlob&&typeof this.globFilter===ic?this.globFilter(n):!0)&&this.fsw._isntIgnored(n,t)&&this.fsw._hasReadPermissions(t)}getDirParts(e){if(!this.hasGlob)return[];let t=[];return(e.includes(nc)?qa.expand(e):[e]).forEach(o=>{t.push(j.relative(this.watchPath,o).split(Ja))}),t}filterDir(e){if(this.hasGlob){let t=this.getDirParts(this.checkGlobSymlink(e)),n=!1;this.unmatchedGlob=!this.dirParts.some(o=>o.every((i,r)=>(i===rc&&(n=!0),n||!t[0][r]||Is(i,t[0][r],Ms))))}return!this.unmatchedGlob&&this.fsw._isntIgnored(this.entryPath(e),e.stats)}},It=class extends Oa{constructor(e){super();let t={};e&&Object.assign(t,e),this._watched=new Map,this._closers=new Map,this._ignoredPaths=new Set,this._throttled=new Map,this._symlinkPaths=new Map,this._streams=new Set,this.closed=!1,he(t,"persistent")&&(t.persistent=!0),he(t,"ignoreInitial")&&(t.ignoreInitial=!1),he(t,"ignorePermissionErrors")&&(t.ignorePermissionErrors=!1),he(t,"interval")&&(t.interval=100),he(t,"binaryInterval")&&(t.binaryInterval=300),he(t,"disableGlobbing")&&(t.disableGlobbing=!1),t.enableBinaryInterval=t.binaryInterval!==t.interval,he(t,"useFsEvents")&&(t.useFsEvents=!t.usePolling),Ho.canUse()||(t.useFsEvents=!1),he(t,"usePolling")&&!t.useFsEvents&&(t.usePolling=lc),dc&&(t.usePolling=!0);let o=process.env.CHOKIDAR_USEPOLLING;if(o!==void 0){let c=o.toLowerCase();c==="false"||c==="0"?t.usePolling=!1:c==="true"||c==="1"?t.usePolling=!0:t.usePolling=!!c}let i=process.env.CHOKIDAR_INTERVAL;i&&(t.interval=Number.parseInt(i,10)),he(t,"atomic")&&(t.atomic=!t.usePolling&&!t.useFsEvents),t.atomic&&(this._pendingUnlinks=new Map),he(t,"followSymlinks")&&(t.followSymlinks=!0),he(t,"awaitWriteFinish")&&(t.awaitWriteFinish=!1),t.awaitWriteFinish===!0&&(t.awaitWriteFinish={});let r=t.awaitWriteFinish;r&&(r.stabilityThreshold||(r.stabilityThreshold=2e3),r.pollInterval||(r.pollInterval=100),this._pendingWrites=new Map),t.ignored&&(t.ignored=Fs(t.ignored));let a=0;this._emitReady=()=>{a++,a>=this._readyCount&&(this._emitReady=ac,this._readyEmitted=!0,process.nextTick(()=>this.emit(za)))},this._emitRaw=(...c)=>this.emit(Ya,...c),this._readyEmitted=!1,this.options=t,t.useFsEvents?this._fsEventsHandler=new Ho(this):this._nodeFsHandler=new Ga(this),Object.freeze(t)}add(e,t,n){let{cwd:o,disableGlobbing:i}=this.options;this.closed=!1;let r=Oo(e);return o&&(r=r.map(a=>{let c=hc(a,o);return i||!Ss(a)?c:Ua(c)})),r=r.filter(a=>a.startsWith($s)?(this._ignoredPaths.add(a.slice(1)),!1):(this._ignoredPaths.delete(a),this._ignoredPaths.delete(a+Ts),this._userIgnored=void 0,!0)),this.options.useFsEvents&&this._fsEventsHandler?(this._readyCount||(this._readyCount=r.length),this.options.persistent&&(this._readyCount+=r.length),r.forEach(a=>this._fsEventsHandler._addToFsEvents(a))):(this._readyCount||(this._readyCount=0),this._readyCount+=r.length,Promise.all(r.map(async a=>{let c=await this._nodeFsHandler._addToNodeFs(a,!n,0,0,t);return c&&this._emitReady(),c})).then(a=>{this.closed||a.filter(c=>c).forEach(c=>{this.add(j.dirname(c),j.basename(t||c))})})),this}unwatch(e){if(this.closed)return this;let t=Oo(e),{cwd:n}=this.options;return t.forEach(o=>{!j.isAbsolute(o)&&!this._closers.has(o)&&(n&&(o=j.join(n,o)),o=j.resolve(o)),this._closePath(o),this._ignoredPaths.add(o),this._watched.has(o)&&this._ignoredPaths.add(o+Ts),this._userIgnored=void 0}),this}close(){if(this.closed)return this._closePromise;this.closed=!0,this.removeAllListeners();let e=[];return this._closers.forEach(t=>t.forEach(n=>{let o=n();o instanceof Promise&&e.push(o)})),this._streams.forEach(t=>t.destroy()),this._userIgnored=void 0,this._readyCount=0,this._readyEmitted=!1,this._watched.forEach(t=>t.dispose()),["closers","watched","streams","symlinkPaths","throttled"].forEach(t=>{this[`_${t}`].clear()}),this._closePromise=e.length?Promise.all(e).then(()=>{}):Promise.resolve(),this._closePromise}getWatched(){let e={};return this._watched.forEach((t,n)=>{let o=this.options.cwd?j.relative(this.options.cwd,n):n;e[o||Uo]=t.getChildren().sort()}),e}emitWithAll(e,t){this.emit(...t),e!==Es&&this.emit(Rs,...t)}async _emit(e,t,n,o,i){if(this.closed)return;let r=this.options;cc&&(t=j.normalize(t)),r.cwd&&(t=j.relative(r.cwd,t));let a=[e,t];i!==void 0?a.push(n,o,i):o!==void 0?a.push(n,o):n!==void 0&&a.push(n);let c=r.awaitWriteFinish,d;if(c&&(d=this._pendingWrites.get(t)))return d.lastChange=new Date,this;if(r.atomic){if(e===No)return this._pendingUnlinks.set(t,a),setTimeout(()=>{this._pendingUnlinks.forEach((u,h)=>{this.emit(...u),this.emit(Rs,...u),this._pendingUnlinks.delete(h)})},typeof r.atomic=="number"?r.atomic:100),this;e===Tt&&this._pendingUnlinks.has(t)&&(e=a[0]=Je,this._pendingUnlinks.delete(t))}if(c&&(e===Tt||e===Je)&&this._readyEmitted){let u=(h,l)=>{h?(e=a[0]=Es,a[1]=h,this.emitWithAll(e,a)):l&&(a.length>2?a[2]=l:a.push(l),this.emitWithAll(e,a))};return this._awaitWriteFinish(t,c.stabilityThreshold,e,u),this}if(e===Je&&!this._throttle(Je,t,50))return this;if(r.alwaysStat&&n===void 0&&(e===Tt||e===Va||e===Je)){let u=r.cwd?j.join(r.cwd,t):t,h;try{h=await pc(u)}catch{}if(!h||this.closed)return;a.push(h)}return this.emitWithAll(e,a),this}_handleError(e){let t=e&&e.code;return e&&t!=="ENOENT"&&t!=="ENOTDIR"&&(!this.options.ignorePermissionErrors||t!=="EPERM"&&t!=="EACCES")&&this.emit(Es,e),e||this.closed}_throttle(e,t,n){this._throttled.has(e)||this._throttled.set(e,new Map);let o=this._throttled.get(e),i=o.get(t);if(i)return i.count++,!1;let r,a=()=>{let d=o.get(t),u=d?d.count:0;return o.delete(t),clearTimeout(r),d&&clearTimeout(d.timeoutObject),u};r=setTimeout(a,n);let c={timeoutObject:r,clear:a,count:0};return o.set(t,c),c}_incrReadyCount(){return this._readyCount++}_awaitWriteFinish(e,t,n,o){let i,r=e;this.options.cwd&&!j.isAbsolute(e)&&(r=j.join(this.options.cwd,e));let a=new Date,c=d=>{Ns.stat(r,(u,h)=>{if(u||!this._pendingWrites.has(e)){u&&u.code!=="ENOENT"&&o(u);return}let l=Number(new Date);d&&h.size!==d.size&&(this._pendingWrites.get(e).lastChange=l);let f=this._pendingWrites.get(e);l-f.lastChange>=t?(this._pendingWrites.delete(e),o(void 0,h)):i=setTimeout(c,this.options.awaitWriteFinish.pollInterval,h)})};this._pendingWrites.has(e)||(this._pendingWrites.set(e,{lastChange:a,cancelWait:()=>(this._pendingWrites.delete(e),clearTimeout(i),n)}),i=setTimeout(c,this.options.awaitWriteFinish.pollInterval))}_getGlobIgnored(){return[...this._ignoredPaths.values()]}_isIgnored(e,t){if(this.options.atomic&&ec.test(e))return!0;if(!this._userIgnored){let{cwd:n}=this.options,o=this.options.ignored,i=o&&o.map(Wo(n)),r=Fs(i).filter(c=>typeof c===Bs&&!Ss(c)).map(c=>c+Ts),a=this._getGlobIgnored().map(Wo(n)).concat(i,r);this._userIgnored=Is(a,void 0,Ms)}return this._userIgnored([e,t])}_isntIgnored(e,t){return!this._isIgnored(e,t)}_getWatchHelpers(e,t){let n=t||this.options.disableGlobbing||!Ss(e)?e:Wa(e),o=this.options.followSymlinks;return new Hs(e,n,o,this)}_getWatchedDir(e){this._boundRemove||(this._boundRemove=this._remove.bind(this));let t=j.resolve(e);return this._watched.has(t)||this._watched.set(t,new Ls(t,this._boundRemove)),this._watched.get(t)}_hasReadPermissions(e){if(this.options.ignorePermissionErrors)return!0;let n=(e&&Number.parseInt(e.mode,10))&511;return!!(4&Number.parseInt(n.toString(8)[0],10))}_remove(e,t,n){let o=j.join(e,t),i=j.resolve(o);if(n=n??(this._watched.has(o)||this._watched.has(i)),!this._throttle("remove",o,100))return;!n&&!this.options.useFsEvents&&this._watched.size===1&&this.add(e,t,!0),this._getWatchedDir(o).getChildren().forEach(l=>this._remove(o,l));let c=this._getWatchedDir(e),d=c.has(t);c.remove(t),this._symlinkPaths.has(i)&&this._symlinkPaths.delete(i);let u=o;if(this.options.cwd&&(u=j.relative(this.options.cwd,o)),this.options.awaitWriteFinish&&this._pendingWrites.has(u)&&this._pendingWrites.get(u).cancelWait()===Tt)return;this._watched.delete(o),this._watched.delete(i);let h=n?Ka:No;d&&!this._isIgnored(o)&&this._emit(h,o),this.options.useFsEvents||this._closePath(o)}_closePath(e){this._closeFile(e);let t=j.dirname(e);this._getWatchedDir(t).remove(j.basename(e))}_closeFile(e){let t=this._closers.get(e);t&&(t.forEach(n=>n()),this._closers.delete(e))}_addPathCloser(e,t){if(!t)return;let n=this._closers.get(e);n||(n=[],this._closers.set(e,n)),n.push(t)}_readdirp(e,t){if(this.closed)return;let n={type:Rs,alwaysStat:!0,lstat:!0,...t},o=ja(e,n);return this._streams.add(o),o.once(Qa,()=>{o=void 0}),o.once(Xa,()=>{o&&(this._streams.delete(o),o=void 0)}),o}};Os.FSWatcher=It;var mc=(s,e)=>{let t=new It(e);return t.add(s),t};Os.watch=mc});var xc={};rr(xc,{activate:()=>bc,deactivate:()=>_c});module.exports=ir(xc);var p=G(require("vscode")),Ae=G(require("path"));var H=G(require("vscode"));var Te=G(require("fs")),ye=G(require("path")),Ks=G(require("crypto")),je=new Map;function Vs(s){let e=ye.join(s,".projectmemory","identity.json");try{if(!Te.existsSync(e))return null;let t=Te.readFileSync(e,"utf-8"),n=JSON.parse(t);return!n.workspace_id||!n.workspace_path?null:{workspaceId:n.workspace_id,workspaceName:ye.basename(n.workspace_path),projectPath:n.workspace_path}}catch{return null}}function re(s){let e=ye.normalize(s);if(console.log("[PM Identity] Resolving identity for:",e),je.has(e)){let n=je.get(e);return console.log("[PM Identity] Cache hit:",n?.workspaceId??"null"),n??null}let t=Vs(e);if(t)return console.log("[PM Identity] Found at root:",t.workspaceId),je.set(e,t),t;try{let n=Te.readdirSync(e,{withFileTypes:!0});console.log("[PM Identity] Scanning",n.length,"entries in root");for(let o of n){if(!o.isDirectory()||o.name.startsWith(".")||o.name==="node_modules")continue;let i=ye.join(e,o.name);if(t=Vs(i),t)return console.log("[PM Identity] Found in subdir:",o.name,"->",t.workspaceId),je.set(e,t),t}}catch(n){console.log("[PM Identity] Scan error:",n)}return console.log("[PM Identity] No identity found, caching null"),je.set(e,null),null}function We(s){let e=ye.normalize(s).toLowerCase(),t=Ks.createHash("sha256").update(e).digest("hex").substring(0,12);return`${ye.basename(s).replace(/[^a-zA-Z0-9-_]/g,"-")}-${t}`}function qt(s,...e){return H.workspace.getConfiguration("projectMemory").get("showNotifications",!0)?H.window.showInformationMessage(s,...e):Promise.resolve(void 0)}var pt=class{constructor(e,t,n){this._extensionUri=e;this._dataRoot=t,this._agentsRoot=n}static viewType="projectMemory.dashboardView";_view;_dataRoot;_agentsRoot;_disposables=[];dispose(){for(;this._disposables.length;){let e=this._disposables.pop();e&&e.dispose()}}getWorkspaceId(){let e=H.workspace.workspaceFolders?.[0];if(!e)return null;let t=e.uri.fsPath;console.log("[PM Debug] getWorkspaceId for fsPath:",t);let n=re(t);if(n)return console.log("[PM Debug] Found identity:",n.workspaceId,"from",n.projectPath),n.workspaceId;let o=We(t);return console.log("[PM Debug] Using fallback ID:",o),o}getWorkspaceName(){let e=H.workspace.workspaceFolders?.[0];if(!e)return"No workspace";let t=re(e.uri.fsPath);return t?t.workspaceName:e.name}resolveWebviewView(e,t,n){this.dispose(),this._view=e,e.webview.options={enableScripts:!0,localResourceRoots:[H.Uri.joinPath(this._extensionUri,"webview","dist"),H.Uri.joinPath(this._extensionUri,"resources")]},e.webview.html=this._getHtmlForWebview(e.webview),this._disposables.push(e.onDidDispose(()=>{this._view=void 0})),this._disposables.push(e.webview.onDidReceiveMessage(async o=>{switch(console.log("Received message from webview:",o),o.type){case"openFile":let{filePath:i,line:r}=o.data;H.commands.executeCommand("projectMemory.openFile",i,r);break;case"runCommand":let{command:a}=o.data;console.log("Executing command:",a);try{await H.commands.executeCommand(a),console.log("Command executed successfully")}catch(_){console.error("Command execution failed:",_),H.window.showErrorMessage(`Command failed: ${_}`)}break;case"openExternal":let{url:c}=o.data;console.log("Opening dashboard panel:",c),H.commands.executeCommand("projectMemory.openDashboardPanel",c);break;case"openPlan":let{planId:d,workspaceId:u}=o.data,h=`http://localhost:5173/workspace/${u}/plan/${d}`;console.log("Opening plan:",h),H.commands.executeCommand("projectMemory.openDashboardPanel",h);break;case"openPlanRoute":await this.openPlanRoute(o.data);break;case"planAction":await this.runPlanAction(o.data);break;case"isolateServer":await H.commands.executeCommand("projectMemory.isolateServer");break;case"copyToClipboard":let{text:l}=o.data;await H.env.clipboard.writeText(l),qt(`Copied to clipboard: ${l}`);break;case"showNotification":let{level:f,text:m}=o.data;f==="error"?H.window.showErrorMessage(m):f==="warning"?H.window.showWarningMessage(m):qt(m);break;case"revealInExplorer":let{path:y}=o.data;H.commands.executeCommand("revealInExplorer",H.Uri.file(y));break;case"getConfig":this.postMessage({type:"config",data:{dataRoot:this._dataRoot,agentsRoot:this._agentsRoot,workspaceFolders:H.workspace.workspaceFolders?.map(_=>({name:_.name,path:_.uri.fsPath}))||[]}});break;case"ready":this.postMessage({type:"init",data:{dataRoot:this._dataRoot,agentsRoot:this._agentsRoot}});break}}))}postMessage(e){this._view&&this._view.webview.postMessage(e)}updateConfig(e,t){this._dataRoot=e,this._agentsRoot=t,this.postMessage({type:"configUpdated",data:{dataRoot:e,agentsRoot:t}})}getApiPort(){let e=H.workspace.getConfiguration("projectMemory");return e.get("serverPort")||e.get("apiPort")||3001}getDashboardUrl(){return"http://localhost:5173"}async pickPlan(){let e=this.getWorkspaceId();if(!e)return H.window.showErrorMessage("No workspace is open."),null;let t=this.getApiPort();try{let n=await fetch(`http://localhost:${t}/api/plans/workspace/${e}`);if(!n.ok)return H.window.showErrorMessage("Failed to load plans from the dashboard server."),null;let o=await n.json(),i=Array.isArray(o.plans)?o.plans:[];if(i.length===0)return H.window.showInformationMessage("No plans found for this workspace."),null;let r=await H.window.showQuickPick(i.map(a=>{let c=a.id||a.plan_id||"unknown";return{label:a.title||c,description:a.status||"unknown",detail:c}}),{placeHolder:"Select a plan"});return!r||!r.detail?null:{workspaceId:e,planId:r.detail}}catch(n){return H.window.showErrorMessage(`Failed to load plans: ${n}`),null}}async openPlanRoute(e){let t=await this.pickPlan();if(!t)return;let{workspaceId:n,planId:o}=t,i=`${this.getDashboardUrl()}/workspace/${n}/plan/${o}`;e.route==="context"?i+="/context":e.route==="build-scripts"&&(i+="/build-scripts"),e.query&&(i+=`?${e.query}`),H.commands.executeCommand("projectMemory.openDashboardPanel",i)}async runPlanAction(e){let t=await this.pickPlan();if(!t)return;let{workspaceId:n,planId:o}=t,i=e.action==="archive"?"Archive":"Resume";if(e.action==="archive"&&await H.window.showWarningMessage(`Archive plan ${o}?`,{modal:!0},"Archive")!=="Archive")return;let r=this.getApiPort();try{let a=await fetch(`http://localhost:${r}/api/plans/${n}/${o}/${e.action}`,{method:"POST"});if(!a.ok){let d=await a.text();H.window.showErrorMessage(`Failed to ${e.action} plan: ${d}`);return}qt(`${i}d plan ${o}`);let c=`${this.getDashboardUrl()}/workspace/${n}/plan/${o}`;H.commands.executeCommand("projectMemory.openDashboardPanel",c)}catch(a){H.window.showErrorMessage(`Failed to ${e.action} plan: ${a}`)}}_getHtmlForWebview(e){let t=ar(),n=H.workspace.getConfiguration("projectMemory"),o=n.get("serverPort")||n.get("apiPort")||3001,i="http://localhost:5173",r=this.getWorkspaceId()||"",a=this.getWorkspaceName(),c=JSON.stringify(this._dataRoot),d={dashboard:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>',knowledgeBase:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6.5 15.5H20"/></svg>',contextFiles:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>',contextFilesGrid:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="M3 15h6"/><path d="M15 3v18"/><path d="M15 9h6"/></svg>',agents:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/></svg>',syncHistory:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/></svg>',diagnostics:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',newTemplate:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="M12 5v14"/></svg>',resumePlan:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 3l14 9-14 9V3z"/></svg>',archive:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>',addContextNote:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3z"/><path d="M15 3v6h6"/><path d="M9 18h6"/><path d="M10 14h4"/></svg>',researchNote:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/><path d="M15 12h-9"/></svg>',createNewPlan:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v4"/><circle cx="18" cy="18" r="3"/><path d="M18 15v6"/><path d="M15 18h6"/></svg>',deployAgents:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v9"/><path d="m16 11 3-3 3 3"/></svg>',deployInstructions:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6.5 15.5H20"/><path d="M14 11V7"/><path d="m11 10 3-3 3 3"/></svg>',deployPrompts:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 11 2-2-2-2"/><path d="M11 9h4"/><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M12 15v4"/><path d="m9 18 3-3 3 3"/></svg>',configureDefaults:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/><path d="m9 12 2 2 4-4"/></svg>',deployAllDefaults:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14"/><path d="M16.5 9.4 7.55 4.24"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/><path d="M17 13h5"/><path d="M17 17h5"/><path d="M17 21h5"/></svg>',handoffEvent:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m16 13 4 4-4 4"/><path d="M20 17H4a2 2 0 0 1-2-2V5"/></svg>',noteEvent:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',stepUpdate:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',searchBox:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',buildScript:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',runButton:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>',stopStale:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="10" height="10" x="7" y="7" rx="2"/></svg>',healthBadge:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',dataRoot:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="3" y2="15"/></svg>',agentHandoff:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></svg>',isolate:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/><path d="M15 3v18"/></svg>'},u=JSON.stringify(d);return`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${e.cspSource} vscode-resource: vscode-webview-resource: data:; style-src 'unsafe-inline'; script-src 'nonce-${t}'; connect-src http://localhost:* ws://localhost:*; frame-src http://localhost:*;">
    <title>Project Memory Dashboard</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { 
            font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif); 
            background: var(--vscode-editor-background, #1e1e1e);
            color: var(--vscode-editor-foreground, #cccccc);
            min-height: 100%;
            display: flex;
            flex-direction: column;
            overflow-y: auto;
        }
        .header {
            padding: 12px 16px;
            border-bottom: 1px solid var(--vscode-panel-border);
            display: flex;
            align-items: center;
            gap: 8px;
            position: sticky;
            top: 0;
            background: var(--vscode-editor-background);
            z-index: 10;
        }
        .header h2 { font-size: 14px; font-weight: 600; }
        .status { 
            display: flex; 
            align-items: center; 
            gap: 6px;
            margin-left: auto;
            font-size: 12px;
        }
        .status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: var(--vscode-testing-iconPassed);
        }
        .status-dot.error { background: var(--vscode-testing-iconFailed); }
        .status-dot.loading { background: var(--vscode-testing-iconQueued); animation: pulse 1s infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        .header-btn {
            background: transparent;
            border: 1px solid var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            padding: 2px 6px;
            border-radius: 3px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 4px;
            font-size: 10px;
        }
        .header-btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
        .header-btn svg { width: 12px; height: 12px; }
        .header-btn.isolated { border-color: var(--vscode-inputValidation-warningBorder); color: var(--vscode-inputValidation-warningBorder); }
        .content {
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow-y: auto;
            padding-bottom: 20px;
        }
        .fallback {
            padding: 20px;
            text-align: center;
        }
        .fallback p { margin-bottom: 12px; color: var(--vscode-descriptionForeground); }
        .btn {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
            margin: 4px;
        }
        .btn:hover { background: var(--vscode-button-hoverBackground); }
        .btn-secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        .btn-small {
            padding: 4px 8px;
            font-size: 11px;
            margin: 2px;
        }
        .icon-grid {
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            gap: 8px;
        }
        .icon-btn {
            border: 1px solid var(--vscode-panel-border);
            background: transparent;
            border-radius: 6px;
            padding: 8px 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            color: var(--vscode-editor-foreground);
        }
        .icon-btn:hover { background: var(--vscode-list-hoverBackground); }
        .icon-btn:focus { outline: 1px solid var(--vscode-focusBorder); }
        .icon-btn svg {
            width: 18px;
            height: 18px;
            opacity: 0.9;
            display: block;
        }
        .icon-row-title {
            font-size: 11px;
            font-weight: 600;
            margin-bottom: 8px;
        }
        .plans-widget {
            background: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 6px;
            margin: 0;
            overflow: hidden;
        }
        .plans-header {
            padding: 12px 16px;
            display: flex;
            align-items: center;
            gap: 8px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .plans-header h3 {
            font-size: 12px;
            flex: 1;
        }
        .plans-tabs {
            display: grid;
            grid-template-columns: 1fr 1fr;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .plans-tab {
            background: transparent;
            border: none;
            padding: 10px 12px;
            cursor: pointer;
            font-size: 12px;
            color: var(--vscode-editor-foreground);
        }
        .plans-tab .count {
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 1px 6px;
            border-radius: 10px;
            font-size: 10px;
            margin-left: 6px;
        }
        .plans-tab.active {
            background: var(--vscode-list-hoverBackground);
            font-weight: 600;
        }
        .plans-content { max-height: 300px; overflow-y: auto; }
        .plans-pane { display: none; }
        .plans-pane.active { display: block; }
        .activity-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .activity-item {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 12px;
        }
        .activity-item svg {
            width: 16px;
            height: 16px;
            opacity: 0.9;
            display: block;
        }
        body.size-small .icon-grid { grid-template-columns: repeat(3, 1fr); }
        body.size-medium .icon-grid { grid-template-columns: repeat(4, 1fr); }
        body.size-large .icon-grid { grid-template-columns: repeat(6, 1fr); }
        
        /* Toast notifications */
        .toast {
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%) translateY(100px);
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            padding: 10px 16px;
            font-size: 12px;
            z-index: 1000;
            opacity: 0;
            transition: transform 0.3s ease, opacity 0.3s ease;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }
        .toast.show {
            transform: translateX(-50%) translateY(0);
            opacity: 1;
        }
        .toast-success {
            border-color: var(--vscode-testing-iconPassed);
            color: var(--vscode-testing-iconPassed);
        }
        .toast-error {
            border-color: var(--vscode-testing-iconFailed);
            color: var(--vscode-testing-iconFailed);
        }
        
        .info-card {
            background: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 6px;
            padding: 16px;
            margin: 12px 16px;
        }
        .info-card h3 { font-size: 12px; margin-bottom: 8px; }
        .info-card ul { list-style: none; font-size: 12px; }
        .info-card li { padding: 4px 0; display: flex; gap: 8px; }
        .info-card .label { color: var(--vscode-descriptionForeground); min-width: 80px; }

        .widget-body ul { list-style: none; font-size: 12px; }
        .widget-body li { padding: 4px 0; display: flex; gap: 8px; }
        .label { color: var(--vscode-descriptionForeground); min-width: 80px; }

        .widget-body {
            padding: 12px 16px;
        }

        .stacked-sections {
            display: flex;
            flex-direction: row;
            gap: 12px;
        }

        .stacked-section {
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            padding: 10px;
            background: rgba(255, 255, 255, 0.02);
            flex: 1 1 0;
        }

        .stacked-section:first-child {
            flex: 2 1 0;
        }

        .stacked-section:last-child {
            flex: 3 1 0;
        }

        body.size-small .stacked-sections {
            flex-direction: column;
        }

        .status-divider {
            border-top: 1px solid var(--vscode-panel-border);
            margin: 10px 0;
            opacity: 0.6;
        }

        .status-list .label {
            min-width: 110px;
        }

        .status-value {
            font-size: 12px;
            font-weight: 600;
            word-break: break-word;
        }

        .status-value.status-ok {
            color: var(--vscode-testing-iconPassed);
        }

        .status-value.status-warn {
            color: var(--vscode-testing-iconQueued);
        }

        .status-value.status-bad {
            color: var(--vscode-testing-iconFailed);
        }

        .search-widget {
            margin: 12px 16px 4px;
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        .search-row {
            display: flex;
            align-items: center;
            gap: 8px;
            border: 1px solid var(--vscode-panel-border);
            background: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 6px;
            padding: 6px 8px;
        }

        .search-row svg {
            width: 16px;
            height: 16px;
            opacity: 0.85;
        }

        .search-input {
            flex: 1;
            background: transparent;
            border: none;
            color: var(--vscode-editor-foreground);
            font-size: 12px;
            outline: none;
        }
        
        /* Collapsible sections */
        .collapsible {
            background: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 6px;
            margin: 8px 16px;
            overflow: hidden;
        }
        .collapsible-header {
            display: flex;
            align-items: center;
            padding: 10px 14px;
            cursor: pointer;
            user-select: none;
            gap: 8px;
            background: transparent;
            border: none;
            width: 100%;
            text-align: left;
            color: inherit;
        }
        .collapsible-header:hover {
            background: var(--vscode-list-hoverBackground);
        }
        .collapsible-header h3 { font-size: 12px; flex: 1; }
        .collapsible-header .count {
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 2px 8px;
            border-radius: 10px;
            font-size: 11px;
        }
        .collapsible-header .chevron {
            display: inline-block;
            transform: rotate(90deg);
            transition: transform 0.2s;
            font-size: 12px;
        }
        .collapsible.collapsed .chevron { transform: rotate(-90deg); }
        .collapsible-content {
            max-height: 300px;
            overflow-y: auto;
            border-top: 1px solid var(--vscode-panel-border);
        }
        .collapsible.collapsed .collapsible-content { display: none; }
        
        /* Plan items */
        .plan-item {
            display: flex;
            align-items: center;
            padding: 10px 16px;
            gap: 10px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .plan-item:last-child { border-bottom: none; }
        .plan-item:hover { background: var(--vscode-list-hoverBackground); }
        .plan-info { flex: 1; min-width: 0; }
        .plan-title { 
            font-size: 12px; 
            font-weight: 500;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .plan-meta {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            display: flex;
            gap: 8px;
            margin-top: 2px;
        }
        .plan-status {
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 10px;
            text-transform: uppercase;
        }
        .plan-status.active { background: var(--vscode-testing-iconPassed); color: white; }
        .plan-status.archived { background: var(--vscode-descriptionForeground); color: white; }
        .plan-actions { display: flex; gap: 4px; }
        
        .empty-state {
            padding: 20px;
            text-align: center;
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h2>Project Memory</h2>
        <button class="header-btn" id="isolateBtn" data-action="isolate-server" title="Spawn isolated server for this workspace">
            ${d.isolate}
            <span id="isolateBtnText">Isolate</span>
        </button>
        <div class="status">
            <span class="status-dot loading" id="statusDot"></span>
            <span id="statusText">Checking...</span>
        </div>
    </div>
    <div class="content" id="content">
        <div class="fallback" id="fallback">
            <p>Connecting to dashboard server...</p>
        </div>
    </div>
    
    <script nonce="${t}">
        const vscode = acquireVsCodeApi();
        const apiPort = ${o};
        const dashboardUrl = '${i}';
        const workspaceId = '${r}';
        const workspaceName = '${a}';
        const dataRoot = ${c};
        const icons = ${u};
        
        let activePlans = [];
        let archivedPlans = [];
        let currentPlanTab = 'active';
        let recentEvents = [];
        let hasRenderedDashboard = false;
        let lastPlanSignature = '';
        
        // Listen for messages from the extension
        window.addEventListener('message', function(event) {
            const message = event.data;
            if (message.type === 'deploymentComplete') {
                const { type, count, targetDir } = message.data;
                showToast('\u2714 Deployed ' + count + ' ' + type + ' to workspace', 'success');
            } else if (message.type === 'deploymentError') {
                showToast('\u274C ' + message.data.error, 'error');
            } else if (message.type === 'isolateServerStatus') {
                const { isolated, port } = message.data;
                const isolateBtn = document.getElementById('isolateBtn');
                const isolateBtnText = document.getElementById('isolateBtnText');
                if (isolateBtn && isolateBtnText) {
                    if (isolated) {
                        isolateBtn.classList.add('isolated');
                        isolateBtnText.textContent = 'Isolated:' + port;
                        isolateBtn.title = 'Running isolated server on port ' + port + '. Click to reconnect to shared server.';
                    } else {
                        isolateBtn.classList.remove('isolated');
                        isolateBtnText.textContent = 'Isolate';
                        isolateBtn.title = 'Spawn isolated server for this workspace';
                    }
                }
            }
        });
        
        // Toast notification system
        function showToast(message, type) {
            // Remove existing toasts
            const existingToast = document.querySelector('.toast');
            if (existingToast) existingToast.remove();
            
            const toast = document.createElement('div');
            toast.className = 'toast toast-' + type;
            toast.textContent = message;
            document.body.appendChild(toast);
            
            // Animate in
            setTimeout(() => toast.classList.add('show'), 10);
            
            // Remove after 3 seconds
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }
        
        // Use event delegation for button clicks (CSP-compliant)
        document.addEventListener('click', function(e) {
            const target = e.target;
            const button = target.closest('button');
            if (!button) return;

            const tab = button.getAttribute('data-tab');
            if (tab) {
                setPlanTab(tab);
                return;
            }
            
            const action = button.getAttribute('data-action');
            const command = button.getAttribute('data-command');
            const planId = button.getAttribute('data-plan-id');
            const copyText = button.getAttribute('data-copy');
            
            if (action === 'toggle-collapse') {
                const targetId = button.getAttribute('data-target');
                const targetEl = targetId ? document.getElementById(targetId) : null;
                if (targetEl) {
                    targetEl.classList.toggle('collapsed');
                }
                return;
            }

            if (action === 'open-browser') {
                vscode.postMessage({ type: 'openExternal', data: { url: dashboardUrl } });
            } else if (action === 'open-context-files') {
                vscode.postMessage({ type: 'openPlanRoute', data: { route: 'context' } });
            } else if (action === 'open-context-note') {
                vscode.postMessage({ type: 'openPlanRoute', data: { route: 'context', query: 'focus=context' } });
            } else if (action === 'open-research-note') {
                vscode.postMessage({ type: 'openPlanRoute', data: { route: 'context', query: 'focus=research' } });
            } else if (action === 'open-build-scripts') {
                vscode.postMessage({ type: 'openPlanRoute', data: { route: 'build-scripts' } });
            } else if (action === 'open-run-script') {
                vscode.postMessage({ type: 'openPlanRoute', data: { route: 'build-scripts', query: 'run=1' } });
            } else if (action === 'open-handoff') {
                vscode.postMessage({ type: 'openPlanRoute', data: { route: 'plan', query: 'tab=timeline' } });
            } else if (action === 'open-resume-plan') {
                vscode.postMessage({ type: 'planAction', data: { action: 'resume' } });
            } else if (action === 'open-archive-plan') {
                vscode.postMessage({ type: 'planAction', data: { action: 'archive' } });
            } else if (action === 'refresh') {
                const statusDot = document.getElementById('statusDot');
                statusDot.className = 'status-dot loading';
                checkServer();
            } else if (action === 'isolate-server') {
                vscode.postMessage({ type: 'isolateServer' });
            } else if (action === 'run-command' && command) {
                vscode.postMessage({ type: 'runCommand', data: { command: command } });
            } else if (action === 'open-plan' && planId) {
                vscode.postMessage({ type: 'openPlan', data: { planId: planId, workspaceId: workspaceId } });
            } else if (action === 'copy' && copyText) {
                vscode.postMessage({ type: 'copyToClipboard', data: { text: copyText } });
            } else if (action === 'open-search') {
                const input = document.getElementById('searchInput');
                const query = input ? input.value.trim() : '';
                openSearch(query);
            }
        });

        document.addEventListener('keydown', function(e) {
            const target = e.target;
            if (target && target.classList && target.classList.contains('search-input') && e.key === 'Enter') {
                const query = target.value.trim();
                openSearch(query);
            }
        });

        function openSearch(query) {
            const suffix = query ? '/search?q=' + encodeURIComponent(query) : '/search';
            vscode.postMessage({ type: 'openExternal', data: { url: dashboardUrl + suffix } });
        }
        
        function renderPlanList(plans, type) {
            if (plans.length === 0) {
                return '<div class="empty-state">No ' + type + ' plans</div>';
            }
            return plans.map(plan => {
                const planId = plan.id || plan.plan_id || 'unknown';
                const shortId = planId.split('_').pop() || planId.substring(0, 8);
                return \`
                    <div class="plan-item">
                        <div class="plan-info">
                            <div class="plan-title" title="\${plan.title}">\${plan.title}</div>
                            <div class="plan-meta">
                                <span>\${plan.category || 'general'}</span>
                                <span>&#8226;</span>
                                <span>\${plan.progress?.done || 0}/\${plan.progress?.total || 0} steps</span>
                            </div>
                        </div>
                        <span class="plan-status \${plan.status}">\${plan.status}</span>
                        <div class="plan-actions">
                            <button class="btn btn-small btn-secondary" data-action="copy" data-copy="\${planId}" title="Copy plan ID">&#128203;</button>
                            <button class="btn btn-small" data-action="open-plan" data-plan-id="\${planId}" title="Open plan">&#8594;</button>
                        </div>
                    </div>
                \`;
            }).join('');
        }

        function setPlanTab(tab) {
            currentPlanTab = tab === 'archived' ? 'archived' : 'active';
            const activeTab = document.getElementById('plansTabActive');
            const archivedTab = document.getElementById('plansTabArchived');
            const activePane = document.getElementById('plansPaneActive');
            const archivedPane = document.getElementById('plansPaneArchived');

            if (activeTab) activeTab.classList.toggle('active', currentPlanTab === 'active');
            if (archivedTab) archivedTab.classList.toggle('active', currentPlanTab === 'archived');
            if (activePane) activePane.classList.toggle('active', currentPlanTab === 'active');
            if (archivedPane) archivedPane.classList.toggle('active', currentPlanTab === 'archived');
        }
        
        function getPlanSignature(plans) {
            return plans.map(plan => {
                const id = plan.id || plan.plan_id || 'unknown';
                const status = plan.status || 'unknown';
                const done = plan.progress?.done || 0;
                const total = plan.progress?.total || 0;
                return id + ':' + status + ':' + done + '/' + total;
            }).join('|');
        }

        async function fetchPlans() {
            if (!workspaceId) {
                console.log('No workspaceId, skipping plan fetch');
                return;
            }
            console.log('Fetching plans for workspace:', workspaceId);
            try {
                const response = await fetch('http://localhost:' + apiPort + '/api/plans/workspace/' + workspaceId);
                console.log('Plans response status:', response.status);
                if (response.ok) {
                    const data = await response.json();
                    console.log('Plans data:', data);
                    const nextActive = (data.plans || []).filter(p => p.status === 'active');
                    const nextArchived = (data.plans || []).filter(p => p.status === 'archived');
                    const signature = getPlanSignature(nextActive) + '||' + getPlanSignature(nextArchived);
                    if (signature !== lastPlanSignature) {
                        lastPlanSignature = signature;
                        activePlans = nextActive;
                        archivedPlans = nextArchived;
                        updatePlanLists();
                    }
                }
            } catch (error) {
                console.log('Failed to fetch plans:', error);
            }
        }
        
        function updatePlanLists() {
            const activeList = document.getElementById('plansListActive');
            const archivedList = document.getElementById('plansListArchived');
            const activeCount = document.getElementById('activeCount');
            const archivedCount = document.getElementById('archivedCount');

            if (activeList) activeList.innerHTML = renderPlanList(activePlans, 'active');
            if (archivedList) archivedList.innerHTML = renderPlanList(archivedPlans, 'archived');
            if (activeCount) activeCount.textContent = activePlans.length;
            if (archivedCount) archivedCount.textContent = archivedPlans.length;

            setPlanTab(currentPlanTab);
        }

        function eventLabel(event) {
            if (!event || !event.type) return 'Activity';
            switch (event.type) {
                case 'handoff_completed':
                case 'handoff_started':
                    return 'Handoff';
                case 'note_added':
                    return 'Note added';
                case 'step_updated':
                    return 'Step updated';
                case 'plan_created':
                    return 'Plan created';
                case 'plan_archived':
                    return 'Plan archived';
                default:
                    return event.type.replace(/_/g, ' ');
            }
        }

        function eventIcon(event) {
            if (!event || !event.type) return icons.diagnostics;
            if (event.type.startsWith('handoff')) return icons.handoffEvent;
            if (event.type === 'note_added') return icons.noteEvent;
            if (event.type === 'step_updated') return icons.stepUpdate;
            return icons.diagnostics;
        }

        function renderActivityList(events) {
            if (!events || events.length === 0) {
                return '<div class="empty-state">No recent activity</div>';
            }
            return events.map(event => {
                const label = eventLabel(event);
                const time = event.timestamp ? new Date(event.timestamp).toLocaleTimeString() : '';
                return \`
                    <div class="activity-item">
                        \${eventIcon(event)}
                        <span>\${label}</span>
                        <span style="margin-left:auto; color: var(--vscode-descriptionForeground);">\${time}</span>
                    </div>
                \`;
            }).join('');
        }

        async function fetchEvents() {
            try {
                const response = await fetch('http://localhost:' + apiPort + '/api/events');
                if (response.ok) {
                    const data = await response.json();
                    recentEvents = (data.events || []).slice(0, 5);
                    const activityList = document.getElementById('activityList');
                    if (activityList) {
                        activityList.innerHTML = renderActivityList(recentEvents);
                    }
                }
            } catch (error) {
                console.log('Failed to fetch events:', error);
            }
        }

        function updateStatusCards(data) {
            const healthValue = document.getElementById('healthStatusValue');
            const staleValue = document.getElementById('staleStatusValue');
            const dataRootValue = document.getElementById('dataRootValue');

            function setStatusClass(element, state) {
                if (!element) return;
                element.classList.remove('status-ok', 'status-warn', 'status-bad');
                if (state) {
                    element.classList.add(state);
                }
            }

            if (healthValue) {
                if (data && typeof data.status === 'string') {
                    healthValue.textContent = data.status;
                    setStatusClass(healthValue, data.status === 'ok' ? 'status-ok' : 'status-warn');
                } else if (data && data.ok === true) {
                    healthValue.textContent = 'Healthy';
                    setStatusClass(healthValue, 'status-ok');
                } else if (data && data.ok === false) {
                    healthValue.textContent = 'Unhealthy';
                    setStatusClass(healthValue, 'status-bad');
                } else {
                    healthValue.textContent = 'Connected';
                    setStatusClass(healthValue, null);
                }
            }

            if (staleValue) {
                if (data && typeof data.stale_count === 'number') {
                    staleValue.textContent = data.stale_count === 0 ? 'None' : data.stale_count + ' stale';
                    setStatusClass(staleValue, data.stale_count === 0 ? 'status-ok' : 'status-warn');
                } else if (data && Array.isArray(data.stale_processes)) {
                    staleValue.textContent = data.stale_processes.length === 0 ? 'None' : data.stale_processes.length + ' stale';
                    setStatusClass(staleValue, data.stale_processes.length === 0 ? 'status-ok' : 'status-warn');
                } else if (data && typeof data.stale === 'boolean') {
                    staleValue.textContent = data.stale ? 'Stale' : 'Fresh';
                    setStatusClass(staleValue, data.stale ? 'status-warn' : 'status-ok');
                } else {
                    staleValue.textContent = 'Not available';
                    setStatusClass(staleValue, null);
                }
            }

            if (dataRootValue) {
                dataRootValue.textContent = dataRoot || 'Unknown';
            }
        }

        function setLayoutSize(width) {
            document.body.classList.remove('size-small', 'size-medium', 'size-large');
            if (width < 300) {
                document.body.classList.add('size-small');
            } else if (width < 420) {
                document.body.classList.add('size-medium');
            } else {
                document.body.classList.add('size-large');
            }
        }

        const sizeObserver = new ResizeObserver(entries => {
            for (const entry of entries) {
                setLayoutSize(entry.contentRect.width);
            }
        });
        sizeObserver.observe(document.body);

        async function checkServer() {
            const statusDot = document.getElementById('statusDot');
            const statusText = document.getElementById('statusText');
            const fallback = document.getElementById('fallback');

            try {
                const response = await fetch('http://localhost:' + apiPort + '/api/health');
                if (response.ok) {
                    const data = await response.json();
                    statusDot.className = 'status-dot';
                    statusText.textContent = 'Connected';

                    if (!hasRenderedDashboard) {
                        fallback.innerHTML = \`
                            <div class="search-widget">
                                <div class="search-row">
                                    ${d.searchBox}
                                    <input class="search-input" id="searchInput" placeholder="Search across memory" />
                                    <button class="btn btn-small" data-action="open-search">Go</button>
                                </div>
                            </div>

                            <section class="collapsible" id="widget-status">
                                <button class="collapsible-header" data-action="toggle-collapse" data-target="widget-status">
                                    <span class="chevron">></span>
                                    <h3>Status</h3>
                                </button>
                                <div class="collapsible-content">
                                    <div class="widget-body">
                                        <ul>
                                            <li><span class="label">Status:</span> <span>Running</span></li>
                                            <li><span class="label">API Port:</span> <span>${o}</span></li>
                                            <li><span class="label">Workspace:</span> <span>${a}</span></li>
                                        </ul>
                                        <div class="status-divider"></div>
                                        <ul class="status-list">
                                            <li><span class="label">Workspace Health</span> <span class="status-value" id="healthStatusValue">Checking...</span></li>
                                            <li><span class="label">Stale/Stop</span> <span class="status-value" id="staleStatusValue">Checking...</span></li>
                                            <li><span class="label">Data Root</span> <span class="status-value" id="dataRootValue">Loading...</span></li>
                                        </ul>
                                    </div>
                                </div>
                            </section>

                            <section class="collapsible" id="widget-actions">
                                <button class="collapsible-header" data-action="toggle-collapse" data-target="widget-actions">
                                    <span class="chevron">></span>
                                    <h3>Actions Panel</h3>
                                </button>
                                <div class="collapsible-content">
                                    <div class="widget-body">
                                        <div class="icon-grid">
                                            <button class="icon-btn" data-action="open-browser" title="Open Full Dashboard">
                                                ${d.dashboard}
                                            </button>
                                            <button class="icon-btn" data-action="refresh" title="Refresh Status">
                                                ${d.syncHistory}
                                            </button>
                                            <button class="icon-btn" data-action="run-command" data-command="projectMemory.createPlan" title="Create New Plan">
                                                ${d.createNewPlan}
                                            </button>
                                            <button class="icon-btn" data-action="run-command" data-command="projectMemory.deployAgents" title="Deploy Agents">
                                                ${d.deployAgents}
                                            </button>
                                            <button class="icon-btn" data-action="run-command" data-command="projectMemory.deployInstructions" title="Deploy Instructions">
                                                ${d.deployInstructions}
                                            </button>
                                            <button class="icon-btn" data-action="run-command" data-command="projectMemory.deployPrompts" title="Deploy Prompts">
                                                ${d.deployPrompts}
                                            </button>
                                            <button class="icon-btn" data-action="open-resume-plan" title="Resume Plan">
                                                ${d.resumePlan}
                                            </button>
                                            <button class="icon-btn" data-action="open-archive-plan" title="Archive Plan">
                                                ${d.archive}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            <section class="collapsible" id="widget-config-context">
                                <button class="collapsible-header" data-action="toggle-collapse" data-target="widget-config-context">
                                    <span class="chevron">></span>
                                    <h3>Configuration & Context</h3>
                                </button>
                                <div class="collapsible-content">
                                    <div class="widget-body">
                                        <div class="stacked-sections">
                                            <div class="stacked-section">
                                                <div class="icon-row-title">Configuration</div>
                                                <div class="icon-grid">
                                                    <button class="icon-btn" data-action="run-command" data-command="projectMemory.openSettings" title="Configure Defaults">
                                                        ${d.configureDefaults}
                                                    </button>
                                                    <button class="icon-btn" data-action="run-command" data-command="projectMemory.deployDefaults" title="Deploy All Defaults">
                                                        ${d.deployAllDefaults}
                                                    </button>
                                                </div>
                                            </div>
                                            <div class="stacked-section">
                                                <div class="icon-row-title">Context</div>
                                                <div class="icon-grid">
                                                    <button class="icon-btn" data-action="open-context-note" title="Add Context Note">
                                                        ${d.addContextNote}
                                                    </button>
                                                    <button class="icon-btn" data-action="open-research-note" title="Add Research Note">
                                                        ${d.researchNote}
                                                    </button>
                                                    <button class="icon-btn" data-action="open-context-files" title="View Context Files">
                                                        ${d.contextFilesGrid}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            <section class="collapsible" id="widget-plans">
                                <button class="collapsible-header" data-action="toggle-collapse" data-target="widget-plans">
                                    <span class="chevron">></span>
                                    <h3>Plans</h3>
                                </button>
                                <div class="collapsible-content">
                                    <div class="plans-widget">
                                        <div class="plans-header">
                                            <h3>Plans</h3>
                                        </div>
                                        <div class="plans-tabs">
                                            <button class="plans-tab active" id="plansTabActive" data-tab="active">
                                                Active <span class="count" id="activeCount">0</span>
                                            </button>
                                            <button class="plans-tab" id="plansTabArchived" data-tab="archived">
                                                Archived <span class="count" id="archivedCount">0</span>
                                            </button>
                                        </div>
                                        <div class="plans-content">
                                            <div class="plans-pane active" id="plansPaneActive">
                                                <div id="plansListActive">
                                                    <div class="empty-state">Loading...</div>
                                                </div>
                                            </div>
                                            <div class="plans-pane" id="plansPaneArchived">
                                                <div id="plansListArchived">
                                                    <div class="empty-state">Loading...</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            <section class="collapsible" id="widget-activity">
                                <button class="collapsible-header" data-action="toggle-collapse" data-target="widget-activity">
                                    <span class="chevron">></span>
                                    <h3>Recent Activity</h3>
                                </button>
                                <div class="collapsible-content">
                                    <div class="widget-body">
                                        <div class="activity-list" id="activityList">
                                            <div class="empty-state">Loading activity...</div>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            <section class="collapsible" id="widget-build">
                                <button class="collapsible-header" data-action="toggle-collapse" data-target="widget-build">
                                    <span class="chevron">></span>
                                    <h3>Build & System</h3>
                                </button>
                                <div class="collapsible-content">
                                    <div class="widget-body">
                                        <div class="icon-grid">
                                            <button class="icon-btn" data-action="open-build-scripts" title="Build Scripts">
                                                ${d.buildScript}
                                            </button>
                                            <button class="icon-btn" data-action="open-run-script" title="Run Script">
                                                ${d.runButton}
                                            </button>
                                            <button class="icon-btn" data-action="open-handoff" title="Agent Handoff">
                                                ${d.agentHandoff}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </section>
                        \`;
                        hasRenderedDashboard = true;
                    }

                    updateStatusCards(data);
                    fetchPlans();
                    fetchEvents();
                } else {
                    throw new Error('Server returned ' + response.status);
                }
            } catch (error) {
                const errorText = error && error.message ? error.message : String(error);
                console.error('Health check failed:', errorText);
                statusDot.className = 'status-dot error';
                statusText.textContent = 'Disconnected';
                hasRenderedDashboard = false;
                fallback.innerHTML = \`
                    <p>Dashboard server is not running</p>
                    <p style="margin-top: 8px; color: var(--vscode-descriptionForeground); font-size: 11px;">Health check: \${errorText}</p>
                    <button class="btn" data-action="run-command" data-command="projectMemory.startServer">Start Server</button>
                    <button class="btn btn-secondary" data-action="refresh">Retry</button>
                    <div class="info-card" style="margin-top: 20px;">
                        <h3>Troubleshooting</h3>
                        <ul>
                            <li>Check if port \${apiPort} is available</li>
                            <li>View server logs for errors</li>
                            <li>Try restarting the server</li>
                        </ul>
                        <button class="btn btn-secondary" style="margin-top: 12px" data-action="run-command" data-command="projectMemory.showServerLogs">Show Server Logs</button>
                        <button class="btn btn-secondary" style="margin-top: 12px" data-action="run-command" data-command="projectMemory.forceStopExternalServer">Force Stop External Server</button>
                    </div>
                \`;
            }
        }
        
        // Initial check
        checkServer();
        
        // Initialize isolated button state based on current port
        (function initIsolateButton() {
            const isIsolated = apiPort !== 3001;
            const isolateBtn = document.getElementById('isolateBtn');
            const isolateBtnText = document.getElementById('isolateBtnText');
            if (isolateBtn && isolateBtnText && isIsolated) {
                isolateBtn.classList.add('isolated');
                isolateBtnText.textContent = 'Isolated:' + apiPort;
                isolateBtn.title = 'Running isolated server on port ' + apiPort + '. Click to reconnect to shared server.';
            }
        })();
        
        // Periodic check every 30 seconds (reduced from 10 for performance)
        setInterval(checkServer, 30000);
        
        // Signal ready
        vscode.postMessage({ type: 'ready' });
    </script>
</body>
</html>`}};function ar(){let s="",e="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";for(let t=0;t<32;t++)s+=e.charAt(Math.floor(Math.random()*e.length));return s}var Le=G(require("vscode")),Vo=G(js()),et=G(require("path"));function Ws(s,...e){return Le.workspace.getConfiguration("projectMemory").get("showNotifications",!0)?Le.window.showInformationMessage(s,...e):Promise.resolve(void 0)}var $t=class{watcher=null;agentsRoot;autoDeploy;constructor(e,t){this.agentsRoot=e,this.autoDeploy=t}start(){if(this.watcher)return;let e=et.join(this.agentsRoot,"*.agent.md");this.watcher=Vo.watch(e,{persistent:!0,ignoreInitial:!0}),this.watcher.on("change",async t=>{let n=et.basename(t,".agent.md");this.autoDeploy?Ws(`Deploying updated agent: ${n}`):await Ws(`Agent template updated: ${n}`,"Deploy to All Workspaces","Ignore")==="Deploy to All Workspaces"&&Le.commands.executeCommand("projectMemory.deployAgents")}),this.watcher.on("add",t=>{let n=et.basename(t,".agent.md");Ws(`New agent template detected: ${n}`)}),console.log(`Agent watcher started for: ${e}`)}stop(){this.watcher&&(this.watcher.close(),this.watcher=null,console.log("Agent watcher stopped"))}setAutoDeploy(e){this.autoDeploy=e}};var Se=G(require("vscode")),Ko=G(js()),Dt=G(require("path"));function qs(s,...e){return Se.workspace.getConfiguration("projectMemory").get("showNotifications",!0)?Se.window.showInformationMessage(s,...e):Promise.resolve(void 0)}var Mt=class{watchers=new Map;config;onFileChange;constructor(e){this.config=e}start(){this.config.agentsRoot&&this.startWatcher("agent",this.config.agentsRoot,"*.agent.md"),this.config.promptsRoot&&this.startWatcher("prompt",this.config.promptsRoot,"*.prompt.md"),this.config.instructionsRoot&&this.startWatcher("instruction",this.config.instructionsRoot,"*.instructions.md")}startWatcher(e,t,n){if(this.watchers.has(e))return;let o=Dt.join(t,n),i=Ko.watch(o,{persistent:!0,ignoreInitial:!0});i.on("change",async r=>{this.handleFileEvent(e,r,"change")}),i.on("add",r=>{this.handleFileEvent(e,r,"add")}),i.on("unlink",r=>{this.handleFileEvent(e,r,"unlink")}),this.watchers.set(e,i),console.log(`${e} watcher started for: ${o}`)}async handleFileEvent(e,t,n){let o=Dt.basename(t),r={agent:"Agent template",prompt:"Prompt file",instruction:"Instruction file"}[e];if(this.onFileChange&&this.onFileChange(e,t,n),n==="unlink"){Se.window.showWarningMessage(`${r} deleted: ${o}`);return}if(n==="add"){qs(`New ${r.toLowerCase()} detected: ${o}`);return}this.config.autoDeploy?(qs(`Auto-deploying updated ${r.toLowerCase()}: ${o}`),this.triggerDeploy(e)):await qs(`${r} updated: ${o}`,"Deploy to All Workspaces","Ignore")==="Deploy to All Workspaces"&&this.triggerDeploy(e)}triggerDeploy(e){let t={agent:"projectMemory.deployAgents",prompt:"projectMemory.deployPrompts",instruction:"projectMemory.deployInstructions"};Se.commands.executeCommand(t[e])}stop(){for(let[e,t]of this.watchers)t.close(),console.log(`${e} watcher stopped`);this.watchers.clear()}updateConfig(e){this.stop(),this.config={...this.config,...e},this.start()}setAutoDeploy(e){this.config.autoDeploy=e}onFileChanged(e){this.onFileChange=e}getWatchedPaths(){let e=[];return this.config.agentsRoot&&e.push({type:"agent",path:this.config.agentsRoot}),this.config.promptsRoot&&e.push({type:"prompt",path:this.config.promptsRoot}),this.config.instructionsRoot&&e.push({type:"instruction",path:this.config.instructionsRoot}),e}};var Lt=G(require("vscode")),Ft=class{statusBarItem;currentAgent=null;currentPlan=null;constructor(){this.statusBarItem=Lt.window.createStatusBarItem(Lt.StatusBarAlignment.Left,100),this.statusBarItem.command="projectMemory.showDashboard",this.updateDisplay(),this.statusBarItem.show()}setCurrentAgent(e){this.currentAgent=e,this.updateDisplay()}setCurrentPlan(e){this.currentPlan=e,this.updateDisplay()}updateDisplay(){this.currentAgent&&this.currentPlan?(this.statusBarItem.text=`$(robot) ${this.currentAgent} \xB7 ${this.currentPlan}`,this.statusBarItem.tooltip=`Project Memory: ${this.currentAgent} working on "${this.currentPlan}"`):this.currentAgent?(this.statusBarItem.text=`$(robot) ${this.currentAgent}`,this.statusBarItem.tooltip=`Project Memory: ${this.currentAgent} active`):(this.statusBarItem.text="$(robot) Project Memory",this.statusBarItem.tooltip="Click to open Project Memory Dashboard")}showTemporaryMessage(e,t=3e3){let n=this.statusBarItem.text,o=this.statusBarItem.tooltip;this.statusBarItem.text=`$(sync~spin) ${e}`,this.statusBarItem.tooltip=e,setTimeout(()=>{this.statusBarItem.text=n,this.statusBarItem.tooltip=o},t)}setCopilotStatus(e){e.agents+e.prompts+e.instructions>0?(this.statusBarItem.text=`$(robot) PM (${e.agents}A/${e.prompts}P/${e.instructions}I)`,this.statusBarItem.tooltip=`Project Memory
Agents: ${e.agents}
Prompts: ${e.prompts}
Instructions: ${e.instructions}`):this.updateDisplay()}dispose(){this.statusBarItem.dispose()}};var ee=G(require("vscode")),fe=require("child_process"),ve=G(require("path")),Us=G(require("http"));function wc(s,...e){return ee.workspace.getConfiguration("projectMemory").get("showNotifications",!0)?ee.window.showInformationMessage(s,...e):Promise.resolve(void 0)}var Ht=class{serverProcess=null;frontendProcess=null;ownedServerPid=null;outputChannel;statusBarItem;_isRunning=!1;_isFrontendRunning=!1;_isExternalServer=!1;_isExternalFrontend=!1;_intentionalStop=!1;config;restartAttempts=0;maxRestartAttempts=3;_performanceStats={apiCalls:0,avgResponseTime:0,lastCheck:Date.now()};constructor(e){this.config=e,this.outputChannel=ee.window.createOutputChannel("Project Memory Server"),this.statusBarItem=ee.window.createStatusBarItem(ee.StatusBarAlignment.Right,100),this.statusBarItem.command="projectMemory.toggleServer"}get isRunning(){return this._isRunning}get isFrontendRunning(){return this._isFrontendRunning}get isExternalServer(){return this._isExternalServer}get performanceStats(){return{...this._performanceStats}}async start(){if(this._isRunning)return this.log("Server is already running"),!0;let e=this.config.serverPort||3001;if(this.log(`Checking if server already exists on port ${e}...`),await this.checkHealth(e))return this.log("Found existing server - connecting without spawning new process"),this._isRunning=!0,this._isExternalServer=!0,this.restartAttempts=0,this.updateStatusBar("connected"),wc("Connected to existing Project Memory server"),!0;let n=this.getServerDirectory();if(!n)return this.log("Dashboard server directory not found"),!1;this.log(`Starting server from: ${n}`),this._isExternalServer=!1,this.updateStatusBar("starting");try{let o={...process.env,PORT:String(this.config.serverPort||3001),WS_PORT:String(this.config.wsPort||3002),MBS_DATA_ROOT:this.config.dataRoot,MBS_AGENTS_ROOT:this.config.agentsRoot,MBS_PROMPTS_ROOT:this.config.promptsRoot||"",MBS_INSTRUCTIONS_ROOT:this.config.instructionsRoot||""},i=ve.join(n,"dist","index.js"),r,a;return require("fs").existsSync(i)?(r="node",a=[i]):(r=process.platform==="win32"?"npx.cmd":"npx",a=["tsx","src/index.ts"]),this.serverProcess=(0,fe.spawn)(r,a,{cwd:n,env:o,shell:!0,windowsHide:!0}),this.serverProcess.stdout?.on("data",u=>{this.log(u.toString().trim())}),this.serverProcess.stderr?.on("data",u=>{this.log(`[stderr] ${u.toString().trim()}`)}),this.serverProcess.on("error",u=>{this.log(`Server error: ${u.message}`),this._isRunning=!1,this.updateStatusBar("error")}),this.serverProcess.on("exit",(u,h)=>{this.log(`Server exited with code ${u}, signal ${h}`),this._isRunning=!1,this.serverProcess=null,this.ownedServerPid=null,this._intentionalStop?(this.log("Intentional stop - not auto-restarting"),this._intentionalStop=!1,this.updateStatusBar("stopped")):u!==0&&this.restartAttempts<this.maxRestartAttempts?(this.restartAttempts++,this.log(`Attempting restart (${this.restartAttempts}/${this.maxRestartAttempts})...`),setTimeout(()=>this.start(),2e3)):this.updateStatusBar("stopped")}),await this.waitForServer(1e4)?(this._isRunning=!0,this.restartAttempts=0,this.ownedServerPid=await this.getPidForPort(e),this.ownedServerPid&&this.log(`Server process id: ${this.ownedServerPid}`),this.updateStatusBar("running"),this.log("Server started successfully"),!0):(this.log("Server failed to start within timeout"),this.stop(),!1)}catch(o){return this.log(`Failed to start server: ${o}`),this.updateStatusBar("error"),!1}}async stop(){if(this._intentionalStop=!0,this._isExternalServer){this.log("Disconnecting from external server (not stopping it)"),this._intentionalStop=!1,this._isRunning=!1,this._isExternalServer=!1,this.updateStatusBar("stopped");return}if(!this.serverProcess&&this.ownedServerPid){if(this.log(`Stopping tracked server pid ${this.ownedServerPid}`),process.platform==="win32")(0,fe.spawn)("taskkill",["/pid",String(this.ownedServerPid),"/f","/t"],{windowsHide:!0});else try{process.kill(this.ownedServerPid,"SIGKILL")}catch(e){this.log(`Failed to kill server pid ${this.ownedServerPid}: ${e}`)}this.ownedServerPid=null,this._isRunning=!1,this.updateStatusBar("stopped");return}if(this.serverProcess)return this.log("Stopping server..."),this.updateStatusBar("stopping"),new Promise(e=>{if(!this.serverProcess){e();return}let t=setTimeout(()=>{this.serverProcess&&(this.log("Force killing server..."),this.serverProcess.kill("SIGKILL")),e()},5e3);this.serverProcess.on("exit",()=>{clearTimeout(t),this._isRunning=!1,this.serverProcess=null,this.ownedServerPid=null,this.updateStatusBar("stopped"),this.log("Server stopped"),e()}),process.platform==="win32"?(0,fe.spawn)("taskkill",["/pid",String(this.serverProcess.pid),"/f","/t"],{windowsHide:!0}):this.serverProcess.kill("SIGTERM")})}async forceStopOwnedServer(){if(this._isExternalServer)return!1;this._intentionalStop=!0;let e=this.config.serverPort||3001,t=this.ownedServerPid||await this.getPidForPort(e);if(!t)return this.log(`No owned server process found on port ${e}`),!1;if(this.log(`Force stopping owned server on port ${e} (pid ${t})`),process.platform==="win32")(0,fe.spawn)("taskkill",["/pid",String(t),"/f","/t"],{windowsHide:!0});else try{process.kill(t,"SIGKILL")}catch(n){return this.log(`Force stop failed: ${n}`),!1}return this.ownedServerPid=null,this._isRunning=!1,this.updateStatusBar("stopped"),!0}async forceStopExternalServer(){if(this.serverProcess&&!this._isExternalServer)return this.log("Server was started by this extension; use Stop Server instead"),!1;this._intentionalStop=!0;let e=this.config.serverPort||3001,t=await this.getPidForPort(e);if(!t)return this.log(`No process found listening on port ${e}`),!1;if(this.log(`Force stopping server on port ${e} (pid ${t})`),process.platform==="win32")(0,fe.spawn)("taskkill",["/pid",String(t),"/f","/t"],{windowsHide:!0});else try{process.kill(t,"SIGKILL")}catch(o){return this.log(`Force stop failed: ${o}`),!1}return await new Promise(o=>setTimeout(o,1e3)),await this.checkHealth(e)?(this.log("Server still responding after force stop"),!1):(this._isRunning=!1,this._isExternalServer=!1,this.updateStatusBar("stopped"),this.log("External server stopped"),!0)}async restart(){return await this.stop(),this.start()}async startFrontend(){if(this._isFrontendRunning)return this.log("Frontend is already running"),!0;if(await this.checkPort(5173))return this.log("Found existing frontend on port 5173 - using it"),this._isFrontendRunning=!0,this._isExternalFrontend=!0,!0;let t=this.getDashboardDirectory();if(!t)return this.log("Could not find dashboard directory for frontend"),!1;this.log(`Starting frontend from: ${t}`);try{let n=process.platform==="win32"?"npm.cmd":"npm",o=["run","dev"];return this.frontendProcess=(0,fe.spawn)(n,o,{cwd:t,shell:!0,windowsHide:!0,env:{...process.env,VITE_API_URL:`http://localhost:${this.config.serverPort||3001}`}}),this.frontendProcess.stdout?.on("data",r=>{this.log(`[frontend] ${r.toString().trim()}`)}),this.frontendProcess.stderr?.on("data",r=>{this.log(`[frontend] ${r.toString().trim()}`)}),this.frontendProcess.on("error",r=>{this.log(`Frontend error: ${r.message}`),this._isFrontendRunning=!1}),this.frontendProcess.on("exit",(r,a)=>{this.log(`Frontend exited with code ${r}, signal ${a}`),this._isFrontendRunning=!1,this.frontendProcess=null}),await this.waitForPort(5173,15e3)?(this._isFrontendRunning=!0,this.log("Frontend started successfully on port 5173"),!0):(this.log("Frontend failed to start within timeout"),!1)}catch(n){return this.log(`Failed to start frontend: ${n}`),!1}}async stopFrontend(){if(this._isExternalFrontend){this.log("Disconnecting from external frontend (not stopping it)"),this._isFrontendRunning=!1,this._isExternalFrontend=!1;return}if(this.frontendProcess)return this.log("Stopping frontend..."),new Promise(e=>{if(!this.frontendProcess){e();return}let t=setTimeout(()=>{this.frontendProcess&&(this.log("Force killing frontend..."),this.frontendProcess.kill("SIGKILL")),e()},5e3);this.frontendProcess.on("exit",()=>{clearTimeout(t),this._isFrontendRunning=!1,this.frontendProcess=null,this.log("Frontend stopped"),e()}),process.platform==="win32"?(0,fe.spawn)("taskkill",["/pid",String(this.frontendProcess.pid),"/f","/t"],{windowsHide:!0}):this.frontendProcess.kill("SIGTERM")})}getDashboardDirectory(){let e=ee.workspace.workspaceFolders?.[0]?.uri.fsPath,t=ee.extensions.getExtension("project-memory.project-memory-dashboard")?.extensionPath,n=[t?ve.join(t,"dashboard"):null,"c:\\Users\\codi.f\\vscode_ModularAgenticProcedureSystem\\dashboard","c:\\Users\\User\\Project_Memory_MCP\\Project-Memory-MCP\\dashboard",e?ve.join(e,"dashboard"):null,t?ve.join(t,"..","dashboard"):null].filter(Boolean),o=require("fs");for(let i of n){let r=ve.join(i,"package.json");if(o.existsSync(r))return this.log(`Found dashboard at: ${i}`),i}return this.log("Could not find dashboard directory for frontend"),null}async waitForPort(e,t){let n=Date.now();for(;Date.now()-n<t;){try{if(await this.checkPort(e))return!0}catch{}await new Promise(o=>setTimeout(o,500))}return!1}checkPort(e){return new Promise(t=>{let n=Us.get(`http://localhost:${e}`,o=>{t(o.statusCode!==void 0)});n.on("error",()=>t(!1)),n.setTimeout(1e3,()=>{n.destroy(),t(!1)})})}updateConfig(e){this.config={...this.config,...e},this._isRunning&&this.restart()}getServerDirectory(){let e=ee.extensions.getExtension("project-memory.project-memory-dashboard")?.extensionPath,t=ee.workspace.workspaceFolders?.[0]?.uri.fsPath,n=[e?ve.join(e,"server"):null,"c:\\Users\\codi.f\\vscode_ModularAgenticProcedureSystem\\dashboard\\server","c:\\Users\\User\\Project_Memory_MCP\\Project-Memory-MCP\\dashboard\\server",t?ve.join(t,"dashboard","server"):null,e?ve.join(e,"..","dashboard","server"):null].filter(Boolean),o=require("fs");for(let i of n){let r=ve.join(i,"package.json");if(o.existsSync(r))return this.log(`Found server at: ${i}`),i}return null}hasServerDirectory(){return this.getServerDirectory()!==null}async waitForServer(e){let t=this.config.serverPort||3001,n=Date.now();for(;Date.now()-n<e;){try{if(await this.checkHealth(t))return!0}catch{}await new Promise(o=>setTimeout(o,500))}return!1}checkHealth(e){return new Promise(t=>{let n=Us.get(`http://localhost:${e}/api/health`,o=>{if(o.statusCode!==200){t(!1),o.resume();return}let i="";o.on("data",r=>{i+=r.toString()}),o.on("end",()=>{try{let r=JSON.parse(i);t(r?.status==="ok")}catch{t(!1)}})});n.on("error",()=>t(!1)),n.setTimeout(1e3,()=>{n.destroy(),t(!1)})})}getPidForPort(e){return new Promise(t=>{if(process.platform==="win32"){(0,fe.exec)(`netstat -ano -p tcp | findstr :${e}`,{windowsHide:!0},(n,o)=>{if(n||!o){t(null);return}let i=o.split(/\r?\n/).map(r=>r.trim()).filter(Boolean);for(let r of i){if(!r.includes(`:${e}`)||!/LISTENING/i.test(r))continue;let a=r.match(/LISTENING\s+(\d+)/i);if(a){t(Number(a[1]));return}}t(null)});return}(0,fe.exec)(`lsof -iTCP:${e} -sTCP:LISTEN -t`,(n,o)=>{if(n||!o){t(null);return}let i=o.split(/\r?\n/).find(a=>a.trim().length>0);if(!i){t(null);return}let r=Number(i.trim());t(Number.isNaN(r)?null:r)})})}updateStatusBar(e){let t={starting:"$(loading~spin)",running:"$(check)",connected:"$(plug)",stopping:"$(loading~spin)",stopped:"$(circle-slash)",error:"$(error)"},n={running:new ee.ThemeColor("statusBarItem.prominentBackground"),connected:new ee.ThemeColor("statusBarItem.prominentBackground"),error:new ee.ThemeColor("statusBarItem.errorBackground")},o={starting:"PM Server",running:"PM Server (local)",connected:"PM Server (shared)",stopping:"PM Server",stopped:"PM Server",error:"PM Server"};this.statusBarItem.text=`${t[e]} ${o[e]||"PM Server"}`,this.statusBarItem.tooltip=`Project Memory Server: ${e}${this._isExternalServer?" (connected to existing)":""}
Click to toggle`,this.statusBarItem.backgroundColor=n[e],this.statusBarItem.show()}async measureApiCall(e){let t=Date.now();try{let n=await e(),o=Date.now()-t;return this._performanceStats.apiCalls++,this._performanceStats.avgResponseTime=(this._performanceStats.avgResponseTime*(this._performanceStats.apiCalls-1)+o)/this._performanceStats.apiCalls,this._performanceStats.lastCheck=Date.now(),n}catch(n){throw n}}log(e){let t=new Date().toISOString();this.outputChannel.appendLine(`[${t}] ${e}`)}showLogs(){this.outputChannel.show()}dispose(){this.stop(),this.stopFrontend(),this.outputChannel.dispose(),this.statusBarItem.dispose()}};var Yo=G(require("vscode")),Y=G(require("fs")),te=G(require("path")),Nt=class{outputChannel;config;constructor(e){this.config=e,this.outputChannel=Yo.window.createOutputChannel("Project Memory Deployment")}updateConfig(e){this.config={...this.config,...e}}async deployToWorkspace(e){let t=[],n=[];this.log(`Deploying defaults to workspace: ${e}`);let o=te.join(e,".github","agents");for(let r of this.config.defaultAgents)try{await this.deployAgent(r,o)&&t.push(r)}catch(a){this.log(`Failed to deploy agent ${r}: ${a}`)}let i=te.join(e,".github","instructions");for(let r of this.config.defaultInstructions)try{await this.deployInstruction(r,i)&&n.push(r)}catch(a){this.log(`Failed to deploy instruction ${r}: ${a}`)}return this.log(`Deployed ${t.length} agents, ${n.length} instructions`),{agents:t,instructions:n}}async deployAgent(e,t){let n=te.join(this.config.agentsRoot,`${e}.agent.md`),o=te.join(t,`${e}.agent.md`);return this.copyFile(n,o)}async deployInstruction(e,t){let n=te.join(this.config.instructionsRoot,`${e}.instructions.md`),o=te.join(t,`${e}.instructions.md`);return this.copyFile(n,o)}async updateWorkspace(e){let t=[],n=[],o=te.join(e,".github","agents"),i=te.join(e,".github","instructions");for(let r of this.config.defaultAgents){let a=te.join(this.config.agentsRoot,`${r}.agent.md`),c=te.join(o,`${r}.agent.md`);if(Y.existsSync(a))if(Y.existsSync(c)){let d=Y.statSync(a),u=Y.statSync(c);d.mtimeMs>u.mtimeMs&&(await this.copyFile(a,c,!0),t.push(r))}else await this.copyFile(a,c),n.push(r)}for(let r of this.config.defaultInstructions){let a=te.join(this.config.instructionsRoot,`${r}.instructions.md`),c=te.join(i,`${r}.instructions.md`);if(Y.existsSync(a))if(Y.existsSync(c)){let d=Y.statSync(a),u=Y.statSync(c);d.mtimeMs>u.mtimeMs&&(await this.copyFile(a,c,!0),t.push(r))}else await this.copyFile(a,c),n.push(r)}return{updated:t,added:n}}getDeploymentPlan(){let e=this.config.defaultAgents.filter(n=>{let o=te.join(this.config.agentsRoot,`${n}.agent.md`);return Y.existsSync(o)}),t=this.config.defaultInstructions.filter(n=>{let o=te.join(this.config.instructionsRoot,`${n}.instructions.md`);return Y.existsSync(o)});return{agents:e,instructions:t}}async copyFile(e,t,n=!1){if(!Y.existsSync(e))return this.log(`Source not found: ${e}`),!1;if(Y.existsSync(t)&&!n)return this.log(`Target exists, skipping: ${t}`),!1;let o=te.dirname(t);return Y.existsSync(o)||Y.mkdirSync(o,{recursive:!0}),Y.copyFileSync(e,t),this.log(`Copied: ${e} -> ${t}`),!0}log(e){let t=new Date().toISOString();this.outputChannel.appendLine(`[${t}] ${e}`)}showLogs(){this.outputChannel.show()}dispose(){this.outputChannel.dispose()}};var ue=G(require("vscode")),Bt=class s{static currentPanel;_panel;_disposables=[];static viewType="projectMemory.dashboard";constructor(e,t,n){this._panel=e,this._update(n),this._panel.onDidDispose(()=>this.dispose(),null,this._disposables),this._panel.webview.onDidReceiveMessage(o=>{o.type==="alert"&&ue.window.showInformationMessage(o.text)},null,this._disposables)}static createOrShow(e,t){let n=ue.window.activeTextEditor?ue.window.activeTextEditor.viewColumn:void 0;if(s.currentPanel){s.currentPanel._panel.reveal(n),s.currentPanel._update(t);return}let o=ue.window.createWebviewPanel(s.viewType,"\u{1F9E0} PMD",n||ue.ViewColumn.One,{enableScripts:!0,retainContextWhenHidden:!0,localResourceRoots:[e]});s.currentPanel=new s(o,e,t)}static revive(e,t,n){s.currentPanel=new s(e,t,n)}_update(e){let t=this._panel.webview;this._panel.title="\u{1F9E0} PMD",this._panel.iconPath={light:ue.Uri.joinPath(ue.Uri.file(__dirname),"..","resources","icon.svg"),dark:ue.Uri.joinPath(ue.Uri.file(__dirname),"..","resources","icon.svg")},t.html=this._getHtmlForWebview(t,e)}_getHtmlForWebview(e,t){let n=vc();return`<!DOCTYPE html>
<html lang="en" style="height: 100%; margin: 0; padding: 0;">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src ${t} http://localhost:*; style-src 'unsafe-inline';">
    <title>Project Memory Dashboard</title>
    <style>
        html, body {
            height: 100%;
            margin: 0;
            padding: 0;
            overflow: hidden;
        }
        iframe {
            width: 100%;
            height: 100%;
            border: none;
        }
        .loading {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100%;
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
        }
        .error {
            text-align: center;
            padding: 20px;
        }
        .error h2 {
            color: var(--vscode-errorForeground);
        }
        .error button {
            margin-top: 16px;
            padding: 8px 16px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }
        .error button:hover {
            background: var(--vscode-button-hoverBackground);
        }
    </style>
</head>
<body>
    <iframe 
        id="dashboard-frame"
        src="${t}"
        title="Project Memory Dashboard"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
    ></iframe>
    
    <script nonce="${n}">
        (function() {
            const iframe = document.getElementById('dashboard-frame');
            if (iframe) {
                iframe.onerror = function() {
                    document.body.innerHTML = \`
                        <div class="error">
                            <h2>Unable to load dashboard</h2>
                            <p>Make sure the dashboard server is running on ${t}</p>
                            <button onclick="location.reload()">Retry</button>
                        </div>
                    \`;
                };
            }
        })();
    </script>
</body>
</html>`}dispose(){for(s.currentPanel=void 0,this._panel.dispose();this._disposables.length;){let e=this._disposables.pop();e&&e.dispose()}}};function vc(){let s="",e="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";for(let t=0;t<32;t++)s+=e.charAt(Math.floor(Math.random()*e.length));return s}var He=G(require("vscode")),Ot=G(require("http"));var tt=class{connected=!1;serverPort=3001;serverHost="localhost";outputChannel;reconnectAttempts=0;maxReconnectAttempts=3;reconnectDelay=1e3;config;_onConnectionChange=new He.EventEmitter;onConnectionChange=this._onConnectionChange.event;constructor(e){this.config=e,this.outputChannel=He.window.createOutputChannel("Project Memory MCP Bridge");let t=He.workspace.getConfiguration("projectMemory");this.serverPort=t.get("serverPort")||3001}async connect(){if(this.connected){this.log("Already connected");return}try{let e=await this.httpGet("/api/health");if(e.status==="ok")this.connected=!0,this.reconnectAttempts=0,this._onConnectionChange.fire(!0),this.log(`Connected to shared server at localhost:${this.serverPort}`),this.log(`Data root: ${e.dataRoot}`);else throw new Error("Server health check failed")}catch(e){throw this.log(`Connection failed: ${e}`),this.connected=!1,this._onConnectionChange.fire(!1),new Error(`Could not connect to Project Memory server.
Please ensure the server is running (check PM Server status bar item).`)}}async disconnect(){this.connected&&(this.connected=!1,this._onConnectionChange.fire(!1),this.log("Disconnected from server"))}isConnected(){return this.connected}async reconnect(){this.connected=!1,this._onConnectionChange.fire(!1),await this.connect()}async callTool(e,t){if(!this.connected)throw new Error("Not connected to Project Memory server");this.log(`Calling tool: ${e} with args: ${JSON.stringify(t)}`);try{let n=await this.mapToolToHttp(e,t);return this.log(`Tool ${e} result: ${JSON.stringify(n).substring(0,200)}...`),n}catch(n){throw this.log(`Tool ${e} error: ${n}`),n}}async mapToolToHttp(e,t){switch(e){case"memory_workspace":return this.handleMemoryWorkspace(t);case"memory_plan":return this.handleMemoryPlan(t);case"memory_steps":return this.handleMemorySteps(t);case"memory_context":return this.handleMemoryContext(t);case"memory_agent":return this.handleMemoryAgent(t);case"register_workspace":return{workspace:{workspace_id:(await this.registerWorkspace(t.workspace_path)).workspace.workspace_id}};case"get_workspace_info":return this.handleMemoryWorkspace({action:"info",workspace_id:t.workspace_id});case"list_workspaces":return this.handleMemoryWorkspace({action:"list"});case"create_plan":return this.handleMemoryPlan({action:"create",workspace_id:t.workspace_id,title:t.title,description:t.description,category:t.category,priority:t.priority,goals:t.goals,success_criteria:t.success_criteria,template:t.template});case"get_plan_state":return this.handleMemoryPlan({action:"get",workspace_id:t.workspace_id,plan_id:t.plan_id});case"list_plans":return this.handleMemoryPlan({action:"list",workspace_id:t.workspace_id});case"update_step":return this.handleMemorySteps({action:"update",workspace_id:t.workspace_id,plan_id:t.plan_id,step_index:t.step_index??t.step_id,status:t.status,notes:t.notes});case"append_steps":return this.handleMemorySteps({action:"add",workspace_id:t.workspace_id,plan_id:t.plan_id,steps:t.steps});case"add_note":return this.handleMemoryPlan({action:"add_note",workspace_id:t.workspace_id,plan_id:t.plan_id,note:t.note,note_type:t.type||"info"});case"handoff":return this.handleMemoryAgent({action:"handoff",workspace_id:t.workspace_id,plan_id:t.plan_id,from_agent:t.from_agent,to_agent:t.to_agent??t.target_agent,reason:t.reason,summary:t.summary,artifacts:t.artifacts});case"get_lineage":return this.httpGet(`/api/plans/${t.workspace_id}/${t.plan_id}/lineage`);case"store_context":return this.handleMemoryContext({action:"store",workspace_id:t.workspace_id,plan_id:t.plan_id,type:t.type,data:t.data});case"get_context":return this.handleMemoryContext({action:"get",workspace_id:t.workspace_id,plan_id:t.plan_id,type:t.type});case"initialise_agent":return this.handleMemoryAgent({action:"init",...t});case"complete_agent":return this.handleMemoryAgent({action:"complete",...t});case"search":return this.httpGet(`/api/search?q=${encodeURIComponent(t.query)}`);default:throw new Error(`Unknown tool: ${e}`)}}async registerWorkspace(e){let t=re(e),n=t?t.projectPath:e,i=(await this.httpGet("/api/workspaces")).workspaces.find(a=>a.path?.toLowerCase()===n.toLowerCase());return i?{workspace:{workspace_id:i.id}}:{workspace:{workspace_id:t?t.workspaceId:We(n)}}}pathToWorkspaceId(e){let t=re(e);return t?t.workspaceId:We(e)}async listTools(){return[{name:"memory_workspace",description:"Workspace management (register, list, info, reindex)"},{name:"memory_plan",description:"Plan management (list, get, create, archive, add_note)"},{name:"memory_steps",description:"Step management (update, batch_update, add)"},{name:"memory_context",description:"Context management (store, get)"},{name:"memory_agent",description:"Agent lifecycle and handoffs"},{name:"register_workspace",description:"Register a workspace"},{name:"list_workspaces",description:"List all workspaces"},{name:"get_workspace_info",description:"Get workspace details"},{name:"create_plan",description:"Create a new plan"},{name:"get_plan_state",description:"Get plan state"},{name:"list_plans",description:"List plans for a workspace"},{name:"update_step",description:"Update a plan step"},{name:"append_steps",description:"Add steps to a plan"},{name:"add_note",description:"Add a note to a plan"},{name:"handoff",description:"Hand off between agents"},{name:"get_lineage",description:"Get handoff lineage"},{name:"store_context",description:"Store context data"},{name:"get_context",description:"Get context data"},{name:"initialise_agent",description:"Initialize an agent session"},{name:"complete_agent",description:"Complete an agent session"},{name:"search",description:"Search across workspaces"}]}async handleMemoryWorkspace(e){let t=e.action;switch(t){case"register":return{workspace_id:(await this.registerWorkspace(e.workspace_path)).workspace.workspace_id};case"list":return this.httpGet("/api/workspaces");case"info":return this.httpGet(`/api/workspaces/${e.workspace_id}`);case"reindex":throw new Error("Workspace reindex is not available via the HTTP bridge.");default:throw new Error(`Unknown memory_workspace action: ${t}`)}}async handleMemoryPlan(e){let t=e.action,n=e.workspace_id,o=e.plan_id;if(!n)throw new Error("workspace_id is required");switch(t){case"list":{let i=await this.httpGet(`/api/plans/workspace/${n}`);return{active_plans:this.normalizePlanSummaries(i.plans||[]),total:i.total}}case"get":{if(!o)throw new Error("plan_id is required");let i=await this.httpGet(`/api/plans/${n}/${o}`);return this.normalizePlanState(i)}case"create":{let i=e.title,r=e.description;if(!i||!r)throw new Error("title and description are required");let a=e.template,c={title:i,description:r,category:e.category||"feature",priority:e.priority||"medium",goals:e.goals,success_criteria:e.success_criteria},d=a?await this.httpPost(`/api/plans/${n}/template`,{...c,template:a}):await this.httpPost(`/api/plans/${n}`,c);if(d&&typeof d=="object"&&"plan"in d){let u=d;if(u.plan)return this.normalizePlanState(u.plan)}return this.normalizePlanState(d)}case"archive":{if(!o)throw new Error("plan_id is required");return this.httpPost(`/api/plans/${n}/${o}/archive`,{})}case"add_note":{if(!o)throw new Error("plan_id is required");return this.httpPost(`/api/plans/${n}/${o}/notes`,{note:e.note,type:e.note_type||"info"})}default:throw new Error(`Unknown memory_plan action: ${t}`)}}async handleMemorySteps(e){let t=e.action,n=e.workspace_id,o=e.plan_id;if(!n||!o)throw new Error("workspace_id and plan_id are required");let i=await this.getPlanState(n,o),r=Array.isArray(i.steps)?[...i.steps]:[];switch(t){case"update":{let a=this.toStepIndex(e.step_index);if(a===null)throw new Error("step_index is required");if(!r[a])throw new Error(`Step index out of range: ${a}`);return e.status&&(r[a].status=e.status),e.notes&&(r[a].notes=e.notes),this.updatePlanSteps(n,o,r)}case"batch_update":{let a=e.updates;if(!a||a.length===0)throw new Error("updates array is required");for(let c of a){let d=this.toStepIndex(c.step_index);if(d===null||!r[d])throw new Error(`Step index out of range: ${c.step_index}`);c.status&&(r[d].status=c.status),c.notes&&(r[d].notes=c.notes)}return this.updatePlanSteps(n,o,r)}case"add":{let a=e.steps||[];if(a.length===0)throw new Error("steps array is required");let c=r.length,d=a.map((h,l)=>({index:c+l,phase:h.phase,task:h.task,status:h.status||"pending",type:h.type,assignee:h.assignee,requires_validation:h.requires_validation,notes:h.notes})),u=r.concat(d);return this.updatePlanSteps(n,o,u)}default:throw new Error(`Unknown memory_steps action: ${t}`)}}async handleMemoryContext(e){let t=e.action,n=e.workspace_id,o=e.plan_id;if(!n||!o)throw new Error("workspace_id and plan_id are required");switch(t){case"store":return this.httpPost(`/api/plans/${n}/${o}/context`,{type:e.type,data:e.data});case"get":{if(!e.type)throw new Error("type is required for context get");return this.httpGet(`/api/plans/${n}/${o}/context/${e.type}`)}case"store_initial":return this.httpPost(`/api/plans/${n}/${o}/context/initial`,{user_request:e.user_request,files_mentioned:e.files_mentioned,file_contents:e.file_contents,requirements:e.requirements,constraints:e.constraints,examples:e.examples,conversation_context:e.conversation_context,additional_notes:e.additional_notes});case"list":return(await this.httpGet(`/api/plans/${n}/${o}/context`)).context||[];case"list_research":return(await this.httpGet(`/api/plans/${n}/${o}/context/research`)).notes||[];case"append_research":return this.httpPost(`/api/plans/${n}/${o}/research`,{filename:e.filename,content:e.content});case"batch_store":{let i=Array.isArray(e.items)?e.items:[];if(i.length===0)throw new Error("items array is required for batch_store");let r=[];for(let a of i){let c=await this.httpPost(`/api/plans/${n}/${o}/context`,{type:a.type,data:a.data});r.push({type:a.type,result:c})}return{stored:r}}case"generate_instructions":throw new Error("generate_instructions is not available via the HTTP bridge.");default:throw new Error(`Unknown memory_context action: ${t}`)}}async handleMemoryAgent(e){let t=e.action,n=e.workspace_id,o=e.plan_id;switch(t){case"get_briefing":{if(!n||!o)throw new Error("workspace_id and plan_id are required");let i=await this.getPlanState(n,o),r=await this.httpGet(`/api/plans/${n}/${o}/lineage`);return{plan:this.normalizePlanState(i),lineage:r}}case"handoff":{if(!n||!o)throw new Error("workspace_id and plan_id are required");let i=e.to_agent||e.target_agent;if(!i)throw new Error("to_agent is required");let r=e.summary||e.reason||"Handoff requested";return this.httpPost(`/api/plans/${n}/${o}/handoff`,{from_agent:e.from_agent||e.agent_type||"Unknown",to_agent:i,reason:e.reason||r,summary:r,artifacts:e.artifacts})}case"init":case"complete":throw new Error("Agent sessions are not available via the HTTP bridge.");default:throw new Error(`Unknown memory_agent action: ${t}`)}}async getPlanState(e,t){let n=await this.httpGet(`/api/plans/${e}/${t}`);return this.normalizePlanState(n)}async updatePlanSteps(e,t,n){return this.httpPut(`/api/plans/${e}/${t}/steps`,{steps:n})}normalizePlanState(e){if(!e||typeof e!="object")return e;let t=e;return!t.plan_id&&typeof t.id=="string"&&(t.plan_id=t.id),Array.isArray(t.steps)&&(t.steps=t.steps.map((n,o)=>({index:typeof n.index=="number"?n.index:o,...n}))),t}normalizePlanSummaries(e){return e.map(t=>this.normalizePlanState(t))}toStepIndex(e){if(typeof e=="number"&&Number.isFinite(e))return e;if(typeof e=="string"&&e.trim().length>0){let t=Number(e);if(Number.isFinite(t))return t}return null}showLogs(){this.outputChannel.show()}dispose(){this.disconnect(),this._onConnectionChange.dispose(),this.outputChannel.dispose()}log(e){let t=new Date().toISOString();this.outputChannel.appendLine(`[${t}] ${e}`),console.log(`[MCP Bridge] ${e}`)}httpGet(e){return new Promise((t,n)=>{let o=`http://${this.serverHost}:${this.serverPort}${e}`;this.log(`GET ${o}`);let i=Ot.get(o,r=>{let a="";r.on("data",c=>a+=c),r.on("end",()=>{try{if(r.statusCode&&r.statusCode>=400){n(new Error(`HTTP ${r.statusCode}: ${a}`));return}let c=JSON.parse(a);t(c)}catch{n(new Error(`Failed to parse response: ${a}`))}})});i.on("error",n),i.setTimeout(1e4,()=>{i.destroy(),n(new Error("Request timeout"))})})}httpPost(e,t){return this.httpRequest("POST",e,t)}httpPut(e,t){return this.httpRequest("PUT",e,t)}httpRequest(e,t,n){return new Promise((o,i)=>{let r=JSON.stringify(n),a=`http://${this.serverHost}:${this.serverPort}${t}`;this.log(`${e} ${a}`);let c={hostname:this.serverHost,port:this.serverPort,path:t,method:e,headers:{"Content-Type":"application/json","Content-Length":Buffer.byteLength(r)}},d=Ot.request(c,u=>{let h="";u.on("data",l=>h+=l),u.on("end",()=>{try{if(u.statusCode&&u.statusCode>=400){i(new Error(`HTTP ${u.statusCode}: ${h}`));return}let l=JSON.parse(h);o(l)}catch{i(new Error(`Failed to parse response: ${h}`))}})});d.on("error",i),d.setTimeout(1e4,()=>{d.destroy(),i(new Error("Request timeout"))}),d.write(r),d.end()})}};var Ne=G(require("vscode"));var st=class{participant;mcpBridge;workspaceId=null;constructor(e){this.mcpBridge=e,this.participant=Ne.chat.createChatParticipant("project-memory.memory",this.handleRequest.bind(this)),this.participant.iconPath=new Ne.ThemeIcon("book"),this.participant.followupProvider={provideFollowups:this.provideFollowups.bind(this)}}async handleRequest(e,t,n,o){if(!this.mcpBridge.isConnected())return n.markdown(`\u26A0\uFE0F **Not connected to MCP server**

Use the "Project Memory: Reconnect Chat to MCP Server" command to reconnect.`),{metadata:{command:"error"}};await this.ensureWorkspaceRegistered(n);try{switch(e.command){case"plan":return await this.handlePlanCommand(e,n,o);case"context":return await this.handleContextCommand(e,n,o);case"handoff":return await this.handleHandoffCommand(e,n,o);case"status":return await this.handleStatusCommand(e,n,o);default:return await this.handleDefaultCommand(e,n,o)}}catch(i){let r=i instanceof Error?i.message:String(i);return n.markdown(`\u274C **Error**: ${r}`),{metadata:{command:"error"}}}}async ensureWorkspaceRegistered(e){if(this.workspaceId)return;let t=Ne.workspace.workspaceFolders?.[0];if(!t){e.markdown(`\u26A0\uFE0F No workspace folder open. Please open a folder first.
`);return}if(!this.mcpBridge.isConnected()){e.markdown(`\u26A0\uFE0F MCP server not connected. Click the MCP status bar item to reconnect.
`);return}try{let n=re(t.uri.fsPath),o=n?n.projectPath:t.uri.fsPath;console.log(`Registering workspace: ${o}`+(n?" (resolved from identity)":""));let i=await this.mcpBridge.callTool("memory_workspace",{action:"register",workspace_path:o});console.log(`Register workspace result: ${JSON.stringify(i)}`),i.workspace_id?(this.workspaceId=i.workspace_id,console.log(`Workspace registered: ${this.workspaceId}`)):(console.error("Unexpected response format:",i),e.markdown(`\u26A0\uFE0F Unexpected response from MCP server. Check console for details.
`))}catch(n){let o=n instanceof Error?n.message:String(n);console.error("Failed to register workspace:",n),e.markdown(`\u26A0\uFE0F Failed to register workspace: ${o}
`)}}async handlePlanCommand(e,t,n){let o=e.prompt.trim();if(!o||o==="list")return await this.listPlans(t);if(o.startsWith("create "))return await this.createPlan(o.substring(7),t);if(o.startsWith("show ")){let i=o.substring(5).trim();return await this.showPlan(i,t)}return t.markdown(`\u{1F4CB} **Plan Commands**

`),t.markdown("- `/plan list` - List all plans in this workspace\n"),t.markdown("- `/plan create <title>` - Create a new plan\n"),t.markdown("- `/plan show <plan-id>` - Show plan details\n"),t.markdown(`
Or just describe what you want to do and I'll help create a plan.`),{metadata:{command:"plan"}}}async listPlans(e){if(!this.workspaceId)return e.markdown("\u26A0\uFE0F Workspace not registered."),{metadata:{command:"plan"}};let n=(await this.mcpBridge.callTool("memory_plan",{action:"list",workspace_id:this.workspaceId})).active_plans||[];if(n.length===0)return e.markdown("\u{1F4CB} **No plans found**\n\nUse `/plan create <title>` to create a new plan."),{metadata:{command:"plan"}};e.markdown(`\u{1F4CB} **Plans in this workspace** (${n.length})

`);for(let o of n){let i=this.getStatusEmoji(o.status),r=o.plan_id||o.id||"unknown";e.markdown(`${i} **${o.title}** \`${r}\`
`),o.category&&e.markdown(`   Category: ${o.category}
`)}return{metadata:{command:"plan",plans:n.length}}}async createPlan(e,t){if(!this.workspaceId)return t.markdown("\u26A0\uFE0F Workspace not registered."),{metadata:{command:"plan"}};t.markdown(`\u{1F504} Creating plan: **${e}**...

`);let n=await this.mcpBridge.callTool("memory_plan",{action:"create",workspace_id:this.workspaceId,title:e,description:e,category:"feature"}),o=n.plan_id||n.id||"unknown";return t.markdown(`\u2705 **Plan created!**

`),t.markdown(`- **ID**: \`${o}\`
`),t.markdown(`- **Title**: ${n.title}
`),t.markdown(`
Use \`/plan show ${o}\` to see details.`),{metadata:{command:"plan",action:"created",planId:o}}}async showPlan(e,t){if(!this.workspaceId)return t.markdown("\u26A0\uFE0F Workspace not registered."),{metadata:{command:"plan"}};let n=await this.mcpBridge.callTool("memory_plan",{action:"get",workspace_id:this.workspaceId,plan_id:e}),o=n.plan_id||n.id||e;if(t.markdown(`# \u{1F4CB} ${n.title}

`),t.markdown(`**ID**: \`${o}\`
`),n.category&&t.markdown(`**Category**: ${n.category}
`),n.priority&&t.markdown(`**Priority**: ${n.priority}
`),n.description&&t.markdown(`
${n.description}
`),n.steps&&n.steps.length>0){t.markdown(`
## Steps

`);for(let i=0;i<n.steps.length;i++){let r=n.steps[i],a=this.getStepStatusEmoji(r.status);t.markdown(`${a} **${r.phase}**: ${r.task}
`)}}if(n.lineage&&n.lineage.length>0){t.markdown(`
## Agent History

`);for(let i of n.lineage)t.markdown(`- **${i.agent_type}** (${i.started_at})
`),i.summary&&t.markdown(`  ${i.summary}
`)}return{metadata:{command:"plan",action:"show",planId:e}}}async handleContextCommand(e,t,n){if(!this.workspaceId)return t.markdown("\u26A0\uFE0F Workspace not registered."),{metadata:{command:"context"}};t.markdown(`\u{1F50D} **Gathering workspace context...**

`);try{let o=await this.mcpBridge.callTool("memory_workspace",{action:"info",workspace_id:this.workspaceId});if(t.markdown(`## Workspace Information

`),t.markdown(`**ID**: \`${o.workspace_id}\`
`),t.markdown(`**Path**: \`${o.workspace_path}\`
`),o.codebase_profile){let i=o.codebase_profile;t.markdown(`
## Codebase Profile

`),i.languages&&i.languages.length>0&&t.markdown(`**Languages**: ${i.languages.join(", ")}
`),i.frameworks&&i.frameworks.length>0&&t.markdown(`**Frameworks**: ${i.frameworks.join(", ")}
`),i.file_count&&t.markdown(`**Files**: ${i.file_count}
`)}}catch{t.markdown(`\u26A0\uFE0F Could not retrieve full context. Basic workspace info:

`),t.markdown(`**Workspace ID**: \`${this.workspaceId}\`
`)}return{metadata:{command:"context"}}}async handleHandoffCommand(e,t,n){let o=e.prompt.trim();if(!o)return t.markdown(`\u{1F91D} **Handoff Command**

`),t.markdown("Usage: `/handoff <agent-type> <plan-id> [summary]`\n\n"),t.markdown(`**Available agents:**
`),t.markdown("- `Coordinator` - Orchestrates the workflow\n"),t.markdown("- `Researcher` - Gathers external information\n"),t.markdown("- `Architect` - Creates implementation plans\n"),t.markdown("- `Executor` - Implements the plan\n"),t.markdown("- `Reviewer` - Validates completed work\n"),t.markdown("- `Tester` - Writes and runs tests\n"),t.markdown("- `Archivist` - Finalizes and archives\n"),t.markdown("- `Analyst` - Deep investigation and analysis\n"),t.markdown("- `Brainstorm` - Explore and refine ideas\n"),t.markdown("- `Runner` - Quick tasks and exploration\n"),t.markdown("- `Builder` - Build verification and diagnostics\n"),{metadata:{command:"handoff"}};let i=o.split(" ");if(i.length<2)return t.markdown(`\u26A0\uFE0F Please provide both agent type and plan ID.
`),t.markdown("Example: `/handoff Executor plan_abc123`"),{metadata:{command:"handoff"}};let r=i[0],a=i[1],c=i.slice(2).join(" ")||"Handoff from chat";if(!this.workspaceId)return t.markdown("\u26A0\uFE0F Workspace not registered."),{metadata:{command:"handoff"}};t.markdown(`\u{1F504} Initiating handoff to **${r}**...

`);try{let d=await this.mcpBridge.callTool("memory_agent",{action:"handoff",workspace_id:this.workspaceId,plan_id:a,from_agent:"User",to_agent:r,summary:c});t.markdown(`\u2705 **Handoff recorded!**

`),t.markdown(`Plan \`${a}\` handoff to **${r}** has been recorded.
`),d?.warning&&t.markdown(`
\u26A0\uFE0F ${d.warning}
`)}catch(d){let u=d instanceof Error?d.message:String(d);t.markdown(`\u274C Handoff failed: ${u}`)}return{metadata:{command:"handoff",targetAgent:r,planId:a}}}async handleStatusCommand(e,t,n){if(!this.workspaceId)return t.markdown("\u26A0\uFE0F Workspace not registered."),{metadata:{command:"status"}};t.markdown(`\u{1F4CA} **Project Memory Status**

`);let o=this.mcpBridge.isConnected();t.markdown(`**MCP Server**: ${o?"\u{1F7E2} Connected":"\u{1F534} Disconnected"}
`),t.markdown(`**Workspace ID**: \`${this.workspaceId}\`

`);try{let a=((await this.mcpBridge.callTool("memory_plan",{action:"list",workspace_id:this.workspaceId})).active_plans||[]).filter(c=>c.status!=="archived");if(t.markdown(`## Active Plans (${a.length})

`),a.length===0)t.markdown(`No active plans.
`);else for(let c of a){let d=this.getStatusEmoji(c.status),u=c.done_steps??c.progress?.done??0,h=c.total_steps??c.progress?.total??0,l=c.plan_id||c.id;t.markdown(`${d} **${c.title}**${l?` (\`${l}\`)`:""}
`),h>0&&t.markdown(`   Progress: ${u}/${h} steps
`)}}catch{t.markdown(`Could not retrieve plan status.
`)}return{metadata:{command:"status"}}}async handleDefaultCommand(e,t,n){let o=e.prompt.trim();if(!o)return t.markdown(`\u{1F44B} **Welcome to Project Memory!**

`),t.markdown(`I can help you manage project plans and agent workflows.

`),t.markdown(`**Available commands:**
`),t.markdown("- `/plan` - View, create, or manage plans\n"),t.markdown("- `/context` - Get workspace context and codebase profile\n"),t.markdown("- `/handoff` - Execute agent handoffs\n"),t.markdown("- `/status` - Show current plan progress\n"),t.markdown(`
Or just ask me about your project!`),{metadata:{command:"help"}};if(o.toLowerCase().includes("plan")||o.toLowerCase().includes("create"))t.markdown(`I can help you with plans!

`),t.markdown("Try using the `/plan` command:\n"),t.markdown("- `/plan list` to see existing plans\n"),t.markdown(`- \`/plan create ${o}\` to create a new plan
`);else{if(o.toLowerCase().includes("status")||o.toLowerCase().includes("progress"))return await this.handleStatusCommand(e,t,n);t.markdown(`I understand you want to: **${o}**

`),t.markdown(`Here's what I can help with:
`),t.markdown(`- Use \`/plan create ${o}\` to create a plan for this
`),t.markdown("- Use `/status` to check current progress\n"),t.markdown("- Use `/context` to get workspace information\n")}return{metadata:{command:"default"}}}provideFollowups(e,t,n){let o=e.metadata,i=o?.command,r=[];switch(i){case"plan":o?.action==="created"&&o?.planId&&r.push({prompt:`/plan show ${o.planId}`,label:"View plan details",command:"plan"}),r.push({prompt:"/status",label:"Check status",command:"status"});break;case"status":r.push({prompt:"/plan list",label:"List all plans",command:"plan"});break;case"help":case"default":r.push({prompt:"/plan list",label:"List plans",command:"plan"}),r.push({prompt:"/status",label:"Check status",command:"status"});break}return r}getStatusEmoji(e){switch(e){case"active":return"\u{1F535}";case"completed":return"\u2705";case"archived":return"\u{1F4E6}";case"blocked":return"\u{1F534}";default:return"\u26AA"}}getStepStatusEmoji(e){switch(e){case"done":return"\u2705";case"active":return"\u{1F504}";case"blocked":return"\u{1F534}";default:return"\u2B1C"}}resetWorkspace(){this.workspaceId=null}dispose(){this.participant.dispose()}};var ne=G(require("vscode")),nt=class{mcpBridge;workspaceId=null;disposables=[];constructor(e){this.mcpBridge=e,this.registerTools()}resetWorkspace(){this.workspaceId=null}registerTools(){this.disposables.push(ne.lm.registerTool("memory_plan",{invoke:async(e,t)=>await this.handlePlan(e,t)})),this.disposables.push(ne.lm.registerTool("memory_steps",{invoke:async(e,t)=>await this.handleSteps(e,t)})),this.disposables.push(ne.lm.registerTool("memory_context",{invoke:async(e,t)=>await this.handleContext(e,t)}))}async ensureWorkspace(){if(this.workspaceId)return this.workspaceId;let e=ne.workspace.workspaceFolders?.[0];if(!e)throw new Error("No workspace folder open");let t=await this.mcpBridge.callTool("memory_workspace",{action:"register",workspace_path:e.uri.fsPath});return this.workspaceId=t.workspace_id,this.workspaceId}async handlePlan(e,t){try{if(!this.mcpBridge.isConnected())return this.errorResult("MCP server not connected");let n=await this.ensureWorkspace(),{action:o,planId:i,title:r,description:a,category:c,priority:d,template:u,goals:h,success_criteria:l,includeArchived:f}=e.input,m;switch(o){case"list":let y=await this.mcpBridge.callTool("memory_plan",{action:"list",workspace_id:n,include_archived:f});m={workspace_id:n,plans:y.active_plans||[],total:(y.active_plans||[]).length,message:(y.active_plans||[]).length>0?`Found ${(y.active_plans||[]).length} plan(s)`:'No plans found. Use action "create" to create one.'};break;case"get":if(!i)return this.errorResult("planId is required for get action");m=await this.mcpBridge.callTool("memory_plan",{action:"get",workspace_id:n,plan_id:i});break;case"create":if(!r||!a)return this.errorResult("title and description are required for create action");m=await this.mcpBridge.callTool("memory_plan",{action:"create",workspace_id:n,title:r,description:a,category:c||"feature",priority:d||"medium",template:u,goals:h,success_criteria:l});break;case"archive":if(!i)return this.errorResult("planId is required for archive action");m=await this.mcpBridge.callTool("memory_plan",{action:"archive",workspace_id:n,plan_id:i});break;default:return this.errorResult(`Unknown action: ${o}`)}return new ne.LanguageModelToolResult([new ne.LanguageModelTextPart(JSON.stringify(m,null,2))])}catch(n){return this.errorResult(n)}}async handleSteps(e,t){try{if(!this.mcpBridge.isConnected())return this.errorResult("MCP server not connected");let n=await this.ensureWorkspace(),{action:o,planId:i,stepIndex:r,status:a,notes:c,updates:d,newSteps:u}=e.input;if(!i)return this.errorResult("planId is required");let h;switch(o){case"update":if(r===void 0||!a)return this.errorResult("stepIndex and status are required for update action");h=await this.mcpBridge.callTool("memory_steps",{action:"update",workspace_id:n,plan_id:i,step_index:r,status:a,notes:c});break;case"batch_update":if(!d||d.length===0)return this.errorResult("updates array is required for batch_update action");h=await this.mcpBridge.callTool("memory_steps",{action:"batch_update",workspace_id:n,plan_id:i,updates:d});break;case"add":if(!u||u.length===0)return this.errorResult("newSteps array is required for add action");h=await this.mcpBridge.callTool("memory_steps",{action:"add",workspace_id:n,plan_id:i,steps:u.map(l=>({...l,status:l.status||"pending"}))});break;default:return this.errorResult(`Unknown action: ${o}`)}return new ne.LanguageModelToolResult([new ne.LanguageModelTextPart(JSON.stringify(h,null,2))])}catch(n){return this.errorResult(n)}}async handleContext(e,t){try{if(!this.mcpBridge.isConnected())return this.errorResult("MCP server not connected");let n=await this.ensureWorkspace(),{action:o,planId:i,note:r,noteType:a,targetAgent:c,reason:d}=e.input,u;switch(o){case"add_note":if(!i||!r)return this.errorResult("planId and note are required for add_note action");u=await this.mcpBridge.callTool("memory_plan",{action:"add_note",workspace_id:n,plan_id:i,note:r,note_type:a||"info"});break;case"briefing":if(!i)return this.errorResult("planId is required for briefing action");u=await this.mcpBridge.callTool("memory_agent",{action:"get_briefing",workspace_id:n,plan_id:i});break;case"handoff":if(!i||!c||!d)return this.errorResult("planId, targetAgent, and reason are required for handoff action");u=await this.mcpBridge.callTool("memory_agent",{action:"handoff",workspace_id:n,plan_id:i,from_agent:"User",to_agent:c,reason:d});break;case"workspace":u=await this.mcpBridge.callTool("memory_workspace",{action:"info",workspace_id:n});break;default:return this.errorResult(`Unknown action: ${o}`)}return new ne.LanguageModelToolResult([new ne.LanguageModelTextPart(JSON.stringify(u,null,2))])}catch(n){return this.errorResult(n)}}errorResult(e){let t=e instanceof Error?e.message:String(e);return new ne.LanguageModelToolResult([new ne.LanguageModelTextPart(JSON.stringify({success:!1,error:t}))])}dispose(){this.disposables.forEach(e=>e.dispose()),this.disposables=[]}};var de,rt,Oe,Gs,D,ot,se=null,Re=null,Ee=null;function q(s,...e){return p.workspace.getConfiguration("projectMemory").get("showNotifications",!0)?p.window.showInformationMessage(s,...e):Promise.resolve(void 0)}async function yc(s,e){try{let t=re(e),n=t?t.projectPath:e,o=await fetch(`http://localhost:${s}/api/workspaces/register`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({workspace_path:n})});if(!o.ok)return null;let r=(await o.json()).workspace;return r?.workspace_id||r?.id||null}catch{return null}}function bc(s){console.log("Project Memory Dashboard extension activating...");let e=p.workspace.getConfiguration("projectMemory"),t=e.get("dataRoot")||Qo(),n=e.get("agentsRoot")||Be(),o=e.get("promptsRoot"),i=e.get("instructionsRoot"),r=e.get("serverPort")||3001,a=e.get("wsPort")||3002,c=e.get("autoStartServer")??!0,d=e.get("defaultAgents")||[],u=e.get("defaultInstructions")||[],h=e.get("autoDeployOnWorkspaceOpen")??!1;if(ot=new Nt({agentsRoot:n,instructionsRoot:i||jt(),defaultAgents:d,defaultInstructions:u}),h&&p.workspace.workspaceFolders?.[0]){let l=p.workspace.workspaceFolders[0].uri.fsPath;ot.deployToWorkspace(l).then(f=>{(f.agents.length>0||f.instructions.length>0)&&q(`Deployed ${f.agents.length} agents and ${f.instructions.length} instructions`)})}D=new Ht({dataRoot:t,agentsRoot:n,promptsRoot:o,instructionsRoot:i,serverPort:r,wsPort:a}),s.subscriptions.push(D),c&&D.hasServerDirectory()&&D.start().then(async l=>{l?D.isExternalServer?q("Connected to existing Project Memory server"):q("Project Memory API server started"):p.window.showWarningMessage("Failed to start Project Memory server. Click to view logs.","View Logs").then(f=>{f==="View Logs"&&D.showLogs()})}),kc(s,e,t),de=new pt(s.extensionUri,t,n),s.subscriptions.push(p.window.registerWebviewViewProvider("projectMemory.dashboardView",de,{webviewOptions:{retainContextWhenHidden:!0}})),s.subscriptions.push(p.commands.registerCommand("projectMemory.showDashboard",()=>{p.commands.executeCommand("workbench.view.extension.projectMemory")}),p.commands.registerCommand("projectMemory.openDashboardPanel",async l=>{if(!D.isRunning){if(await p.window.showWarningMessage("Project Memory server is not running. Start it first?","Start Server","Cancel")!=="Start Server")return;if(!await p.window.withProgress({location:p.ProgressLocation.Notification,title:"Starting Project Memory server...",cancellable:!1},async()=>await D.start())){p.window.showErrorMessage("Failed to start server. Check logs for details."),D.showLogs();return}}if(!D.isFrontendRunning&&!await p.window.withProgress({location:p.ProgressLocation.Notification,title:"Starting dashboard frontend...",cancellable:!1},async()=>await D.startFrontend())){p.window.showErrorMessage("Failed to start dashboard frontend. Check server logs."),D.showLogs();return}let f=l||"http://localhost:5173";Bt.createOrShow(s.extensionUri,f)}),p.commands.registerCommand("projectMemory.toggleServer",async()=>{D.isRunning?(await D.stopFrontend(),await D.stop(),q("Project Memory server stopped")):await D.start()?q("Project Memory server started"):p.window.showErrorMessage("Failed to start Project Memory server")}),p.commands.registerCommand("projectMemory.startServer",async()=>{if(D.isRunning){q("Server is already running");return}await D.start()?q("Project Memory server started"):(p.window.showErrorMessage("Failed to start server. Check logs for details."),D.showLogs())}),p.commands.registerCommand("projectMemory.stopServer",async()=>{await D.stopFrontend(),await D.stop(),q("Project Memory server stopped")}),p.commands.registerCommand("projectMemory.migrateWorkspace",async()=>{let l=await p.window.showOpenDialog({canSelectFiles:!1,canSelectFolders:!0,canSelectMany:!1,openLabel:"Select Workspace to Migrate",title:"Select a workspace directory to migrate to the new identity system"});if(!l||l.length===0)return;let f=l[0].fsPath;if(!se){p.window.showErrorMessage("MCP Bridge not initialized. Please wait for the extension to fully load.");return}if(!se.isConnected())try{await se.connect()}catch{p.window.showErrorMessage("Failed to connect to MCP server. Please check the server is configured correctly.");return}await p.window.withProgress({location:p.ProgressLocation.Notification,title:"Migrating workspace...",cancellable:!1},async m=>{try{m.report({message:"Stopping dashboard server..."});let y=D.isRunning;y&&(await D.stopFrontend(),await D.stop()),await new Promise(I=>setTimeout(I,500)),m.report({message:"Running migration..."});let _=await se.callTool("memory_workspace",{action:"migrate",workspace_path:f});y&&(m.report({message:"Restarting dashboard server..."}),await D.start());let C=_.ghost_folders_found?.length||0,S=_.ghost_folders_merged?.length||0,P=_.plans_recovered?.length||0,$=`Migration complete for ${Ae.basename(f)}.
`;$+=`Workspace ID: ${_.workspace_id}
`,C>0&&($+=`Found ${C} ghost folders, merged ${S}.
`),P>0&&($+=`Recovered ${P} plans.
`),_.notes&&_.notes.length>0&&($+=`Notes: ${_.notes.slice(0,3).join("; ")}`),p.window.showInformationMessage($,{modal:!0})}catch(y){D.isRunning===!1&&await D.start(),p.window.showErrorMessage(`Migration failed: ${y.message}`)}})}),p.commands.registerCommand("projectMemory.forceStopExternalServer",async()=>{let f=p.workspace.getConfiguration("projectMemory").get("serverPort")||3001;if(await p.window.showWarningMessage(`Force stop the external server on port ${f}?`,{modal:!0},"Force Stop")!=="Force Stop")return;await D.forceStopExternalServer()?q("External server stopped"):(p.window.showErrorMessage("Failed to stop external server. Check logs for details."),D.showLogs())}),p.commands.registerCommand("projectMemory.restartServer",async()=>{q("Restarting Project Memory server..."),await D.stopFrontend(),await D.restart()?q("Project Memory server restarted"):p.window.showErrorMessage("Failed to restart server")}),p.commands.registerCommand("projectMemory.showServerLogs",()=>{D.showLogs()}),p.commands.registerCommand("projectMemory.isolateServer",async()=>{let l=p.workspace.getConfiguration("projectMemory"),f=l.get("serverPort")||3001,m=f!==3001;if(m)await l.update("serverPort",3001,p.ConfigurationTarget.Workspace),await D.stopFrontend(),await D.stop(),p.window.showInformationMessage("Switching to shared server on port 3001. Reloading window...","Reload").then(y=>{y==="Reload"&&p.commands.executeCommand("workbench.action.reloadWindow")});else{let y=p.workspace.workspaceFolders?.[0];if(!y){p.window.showErrorMessage("No workspace folder open");return}let _=require("crypto").createHash("md5").update(y.uri.fsPath.toLowerCase()).digest("hex"),C=3101+parseInt(_.substring(0,4),16)%99;await l.update("serverPort",C,p.ConfigurationTarget.Workspace),await D.stopFrontend(),await D.stop(),p.window.showInformationMessage(`Switching to isolated server on port ${C}. Reloading window...`,"Reload").then(S=>{S==="Reload"&&p.commands.executeCommand("workbench.action.reloadWindow")})}de?.postMessage({type:"isolateServerStatus",data:{isolated:!m,port:m?3001:f}})}),p.commands.registerCommand("projectMemory.openSettings",async()=>{let l=p.workspace.getConfiguration("projectMemory"),f=l.get("agentsRoot")||Be(),m=l.get("instructionsRoot")||jt(),y=l.get("promptsRoot")||Xo(),_=await p.window.showQuickPick([{label:"$(person) Configure Default Agents",description:"Select which agents to deploy by default",value:"agents"},{label:"$(book) Configure Default Instructions",description:"Select which instructions to deploy by default",value:"instructions"},{label:"$(file) Configure Default Prompts",description:"Select which prompts to deploy by default",value:"prompts"},{label:"$(gear) Open All Settings",description:"Open VS Code settings for Project Memory",value:"settings"}],{placeHolder:"What would you like to configure?"});if(!_)return;let C=require("fs");if(_.value==="settings"){p.commands.executeCommand("workbench.action.openSettings","@ext:project-memory.project-memory-dashboard");return}if(_.value==="agents"&&f)try{let S=C.readdirSync(f).filter(R=>R.endsWith(".agent.md")).map(R=>R.replace(".agent.md","")),P=l.get("defaultAgents")||[],$=S.map(R=>({label:R,picked:P.length===0||P.includes(R)})),I=await p.window.showQuickPick($,{canPickMany:!0,placeHolder:"Select default agents (these will be pre-selected when deploying)",title:"Configure Default Agents"});I&&(await l.update("defaultAgents",I.map(R=>R.label),p.ConfigurationTarget.Global),q(`\u2705 Updated default agents (${I.length} selected)`))}catch(S){p.window.showErrorMessage(`Failed to read agents: ${S}`)}if(_.value==="instructions"&&m)try{let S=C.readdirSync(m).filter(R=>R.endsWith(".instructions.md")).map(R=>R.replace(".instructions.md","")),P=l.get("defaultInstructions")||[],$=S.map(R=>({label:R,picked:P.length===0||P.includes(R)})),I=await p.window.showQuickPick($,{canPickMany:!0,placeHolder:"Select default instructions (these will be pre-selected when deploying)",title:"Configure Default Instructions"});I&&(await l.update("defaultInstructions",I.map(R=>R.label),p.ConfigurationTarget.Global),q(`\u2705 Updated default instructions (${I.length} selected)`))}catch(S){p.window.showErrorMessage(`Failed to read instructions: ${S}`)}if(_.value==="prompts"&&y)try{let S=C.readdirSync(y).filter(R=>R.endsWith(".prompt.md")).map(R=>R.replace(".prompt.md","")),P=l.get("defaultPrompts")||[],$=S.map(R=>({label:R,picked:P.length===0||P.includes(R)})),I=await p.window.showQuickPick($,{canPickMany:!0,placeHolder:"Select default prompts (these will be pre-selected when deploying)",title:"Configure Default Prompts"});I&&(await l.update("defaultPrompts",I.map(R=>R.label),p.ConfigurationTarget.Global),q(`\u2705 Updated default prompts (${I.length} selected)`))}catch(S){p.window.showErrorMessage(`Failed to read prompts: ${S}`)}}),p.commands.registerCommand("projectMemory.createPlan",async()=>{let l=p.workspace.workspaceFolders;if(!l){p.window.showErrorMessage("No workspace folder open");return}let f=await p.window.showQuickPick([{label:"\u{1F9E0} Brainstorm First",description:"Explore ideas with an AI agent before creating a formal plan",value:"brainstorm"},{label:"\u{1F4DD} Create Plan Directly",description:"Create a formal plan with title, description, and category",value:"create"}],{placeHolder:"How would you like to start?"});if(!f)return;if(f.value==="brainstorm"){let A=await p.window.showInputBox({prompt:"What would you like to brainstorm?",placeHolder:"Describe the feature, problem, or idea you want to explore...",validateInput:g=>g.trim()?null:"Please enter a description"});if(!A)return;try{await p.commands.executeCommand("workbench.action.chat.open",{query:`@brainstorm ${A}`})}catch{await p.window.showInformationMessage("Open GitHub Copilot Chat and use @brainstorm agent with your prompt.","Copy Prompt")==="Copy Prompt"&&(await p.env.clipboard.writeText(`@brainstorm ${A}`),q("Prompt copied to clipboard"))}return}let m=await p.window.showInputBox({prompt:"Enter plan title",placeHolder:"My new feature...",validateInput:A=>A.trim()?null:"Title is required"});if(!m)return;let y=await p.window.showInputBox({prompt:"Enter plan description",placeHolder:"Describe what this plan will accomplish, the goals, and any context...",validateInput:A=>A.trim().length>=10?null:"Please provide at least a brief description (10+ characters)"});if(!y)return;let _=A=>A?A.split(/[,\n]+/).map(g=>g.trim()).filter(g=>g.length>0):[],C=[];try{let A=await fetch(`http://localhost:${r}/api/plans/templates`);if(A.ok){let g=await A.json();C=Array.isArray(g.templates)?g.templates:[]}}catch{}C.length===0&&(C=[{template:"feature",label:"Feature",category:"feature"},{template:"bugfix",label:"Bug Fix",category:"bug"},{template:"refactor",label:"Refactor",category:"refactor"},{template:"documentation",label:"Documentation",category:"documentation"},{template:"analysis",label:"Analysis",category:"analysis"},{template:"investigation",label:"Investigation",category:"investigation"}]);let S=await p.window.showQuickPick([{label:"Custom",description:"Choose category and define your own steps",value:"custom"},...C.map(A=>({label:A.label||A.template,description:A.category||A.template,value:A.template}))],{placeHolder:"Select a plan template (optional)"});if(!S)return;let P=S.value!=="custom"?S.value:null,$=null,I=[],R=[];if(!P){let A=await p.window.showQuickPick([{label:"\u2728 Feature",description:"New functionality or capability",value:"feature"},{label:"\u{1F41B} Bug",description:"Fix for an existing issue",value:"bug"},{label:"\u{1F504} Change",description:"Modification to existing behavior",value:"change"},{label:"\u{1F50D} Analysis",description:"Investigation or research task",value:"analysis"},{label:"\u{1F9EA} Investigation",description:"Deep-dive analysis with findings",value:"investigation"},{label:"\u{1F41E} Debug",description:"Debugging session for an issue",value:"debug"},{label:"\u267B\uFE0F Refactor",description:"Code improvement without behavior change",value:"refactor"},{label:"\u{1F4DA} Documentation",description:"Documentation updates",value:"documentation"}],{placeHolder:"Select plan category"});if(!A)return;$=A.value}let W=await p.window.showQuickPick([{label:"\u{1F534} Critical",description:"Urgent - needs immediate attention",value:"critical"},{label:"\u{1F7E0} High",description:"Important - should be done soon",value:"high"},{label:"\u{1F7E1} Medium",description:"Normal priority",value:"medium"},{label:"\u{1F7E2} Low",description:"Nice to have - when time permits",value:"low"}],{placeHolder:"Select priority level"});if(!W)return;if(!P&&$==="investigation"){let A=await p.window.showInputBox({prompt:"Enter investigation goals (comma-separated)",placeHolder:"Identify root cause, confirm scope"});I=_(A);let g=await p.window.showInputBox({prompt:"Enter success criteria (comma-separated)",placeHolder:"Root cause identified, resolution path defined"});if(R=_(g),I.length===0||R.length===0){p.window.showErrorMessage("Investigation plans require at least 1 goal and 1 success criteria.");return}}let k=l[0].uri.fsPath,T=await yc(r,k);if(!T){p.window.showErrorMessage("Failed to register workspace with the dashboard server.");return}try{let A={title:m,description:y,priority:W.value,goals:I.length>0?I:void 0,success_criteria:R.length>0?R:void 0},g=P?await fetch(`http://localhost:${r}/api/plans/${T}/template`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...A,template:P})}):await fetch(`http://localhost:${r}/api/plans/${T}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...A,category:$})});if(g.ok){let N=await g.json(),M=N.plan_id||N.plan?.id||N.plan?.plan_id||N.planId;q(`Plan created: ${m}`,"Open Dashboard").then(Q=>{Q==="Open Dashboard"&&M&&p.commands.executeCommand("projectMemory.openDashboardPanel",`http://localhost:5173/workspace/${T}/plan/${M}`)})}else{let N=await g.text();p.window.showErrorMessage(`Failed to create plan: ${N}`)}}catch(A){p.window.showErrorMessage(`Failed to create plan: ${A}`)}}),p.commands.registerCommand("projectMemory.deployAgents",async()=>{let l=p.workspace.workspaceFolders;if(!l){p.window.showErrorMessage("No workspace folder open");return}let f=p.workspace.getConfiguration("projectMemory"),m=f.get("agentsRoot"),y=m||Be(),_=f.get("instructionsRoot")||jt(),C=f.get("defaultAgents")||[],S=f.get("defaultInstructions")||[];if(console.log("[ProjectMemory] Deploy Agents - Config agentsRoot:",m),console.log("[ProjectMemory] Deploy Agents - Resolved agentsRoot:",y),console.log("[ProjectMemory] Deploy Agents - Default fallback would be:",Be()),!y){p.window.showErrorMessage("Agents root not configured. Set projectMemory.agentsRoot in settings.");return}let P=l[0].uri.fsPath,$=require("fs"),I=require("path");try{let R=$.readdirSync(y).filter(M=>M.endsWith(".agent.md"));if(R.length===0){p.window.showWarningMessage("No agent files found in agents root");return}let W=R.map(M=>{let Q=M.replace(".agent.md","");return{label:Q,description:M,picked:C.length===0||C.includes(Q)}}),k=await p.window.showQuickPick(W,{canPickMany:!0,placeHolder:"Select agents to deploy",title:"Deploy Agents"});if(!k||k.length===0)return;let T=I.join(P,".github","agents");$.mkdirSync(T,{recursive:!0});let A=0;for(let M of k){let Q=`${M.label}.agent.md`,w=I.join(y,Q),v=I.join(T,Q);$.copyFileSync(w,v),A++}let g=0;if(_&&S.length>0){let M=I.join(P,".github","instructions");$.mkdirSync(M,{recursive:!0});for(let Q of S){let w=`${Q}.instructions.md`,v=I.join(_,w),J=I.join(M,w);$.existsSync(v)&&($.copyFileSync(v,J),g++)}}de.postMessage({type:"deploymentComplete",data:{type:"agents",count:A,instructionsCount:g,targetDir:T}});let N=g>0?`\u2705 Deployed ${A} agent(s) and ${g} instruction(s)`:`\u2705 Deployed ${A} agent(s)`;q(N,"Open Folder").then(M=>{M==="Open Folder"&&p.commands.executeCommand("revealInExplorer",p.Uri.file(T))})}catch(R){p.window.showErrorMessage(`Failed to deploy agents: ${R}`)}}),p.commands.registerCommand("projectMemory.deployPrompts",async()=>{let l=p.workspace.workspaceFolders;if(!l){p.window.showErrorMessage("No workspace folder open");return}let f=p.workspace.getConfiguration("projectMemory"),m=f.get("promptsRoot")||Xo(),y=f.get("defaultPrompts")||[];if(!m){p.window.showErrorMessage("Prompts root not configured. Set projectMemory.promptsRoot in settings.");return}let _=l[0].uri.fsPath,C=require("fs"),S=require("path");try{let P=C.readdirSync(m).filter(k=>k.endsWith(".prompt.md"));if(P.length===0){p.window.showWarningMessage("No prompt files found in prompts root");return}let $=P.map(k=>{let T=k.replace(".prompt.md","");return{label:T,description:k,picked:y.length===0||y.includes(T)}}),I=await p.window.showQuickPick($,{canPickMany:!0,placeHolder:"Select prompts to deploy",title:"Deploy Prompts"});if(!I||I.length===0)return;let R=S.join(_,".github","prompts");C.mkdirSync(R,{recursive:!0});let W=0;for(let k of I){let T=`${k.label}.prompt.md`,A=S.join(m,T),g=S.join(R,T);C.copyFileSync(A,g),W++}de.postMessage({type:"deploymentComplete",data:{type:"prompts",count:W,targetDir:R}}),q(`\u2705 Deployed ${W} prompt(s) to ${S.relative(_,R)}`,"Open Folder").then(k=>{k==="Open Folder"&&p.commands.executeCommand("revealInExplorer",p.Uri.file(R))})}catch(P){p.window.showErrorMessage(`Failed to deploy prompts: ${P}`)}}),p.commands.registerCommand("projectMemory.deployInstructions",async()=>{let l=p.workspace.workspaceFolders;if(!l){p.window.showErrorMessage("No workspace folder open");return}let f=p.workspace.getConfiguration("projectMemory"),m=f.get("instructionsRoot")||jt(),y=f.get("defaultInstructions")||[];if(!m){p.window.showErrorMessage("Instructions root not configured. Set projectMemory.instructionsRoot in settings.");return}let _=l[0].uri.fsPath,C=require("fs"),S=require("path");try{let P=C.readdirSync(m).filter(k=>k.endsWith(".instructions.md"));if(P.length===0){p.window.showWarningMessage("No instruction files found in instructions root");return}let $=P.map(k=>{let T=k.replace(".instructions.md","");return{label:T,description:k,picked:y.length===0||y.includes(T)}}),I=await p.window.showQuickPick($,{canPickMany:!0,placeHolder:"Select instructions to deploy",title:"Deploy Instructions"});if(!I||I.length===0)return;let R=S.join(_,".github","instructions");C.mkdirSync(R,{recursive:!0});let W=0;for(let k of I){let T=`${k.label}.instructions.md`,A=S.join(m,T),g=S.join(R,T);C.copyFileSync(A,g),W++}de.postMessage({type:"deploymentComplete",data:{type:"instructions",count:W,targetDir:R}}),q(`\u2705 Deployed ${W} instruction(s) to ${S.relative(_,R)}`,"Open Folder").then(k=>{k==="Open Folder"&&p.commands.executeCommand("revealInExplorer",p.Uri.file(R))})}catch(P){p.window.showErrorMessage(`Failed to deploy instructions: ${P}`)}}),p.commands.registerCommand("projectMemory.deployCopilotConfig",async()=>{let l=p.workspace.workspaceFolders;if(!l){p.window.showErrorMessage("No workspace folder open");return}await p.window.showQuickPick(["Yes","No"],{placeHolder:"Deploy all Copilot config (agents, prompts, instructions)?"})==="Yes"&&(de.postMessage({type:"deployAllCopilotConfig",data:{workspacePath:l[0].uri.fsPath}}),q("Deploying all Copilot configuration..."))}),p.commands.registerCommand("projectMemory.deployDefaults",async()=>{let l=p.workspace.workspaceFolders;if(!l){p.window.showErrorMessage("No workspace folder open");return}let f=ot.getDeploymentPlan();if(await p.window.showQuickPick(["Yes","No"],{placeHolder:`Deploy ${f.agents.length} agents and ${f.instructions.length} instructions?`})==="Yes"){let y=await ot.deployToWorkspace(l[0].uri.fsPath);q(`Deployed ${y.agents.length} agents and ${y.instructions.length} instructions`)}}),p.commands.registerCommand("projectMemory.updateDefaults",async()=>{let l=p.workspace.workspaceFolders;if(!l){p.window.showErrorMessage("No workspace folder open");return}let f=await ot.updateWorkspace(l[0].uri.fsPath);f.updated.length>0||f.added.length>0?q(`Updated ${f.updated.length} files, added ${f.added.length} new files`):q("All files are up to date")}),p.commands.registerCommand("projectMemory.openAgentFile",async()=>{let f=p.workspace.getConfiguration("projectMemory").get("agentsRoot")||Be();if(!f){p.window.showErrorMessage("Agents root not configured");return}let m=require("fs"),y=require("path");try{let _=m.readdirSync(f).filter(S=>S.endsWith(".agent.md")),C=await p.window.showQuickPick(_,{placeHolder:"Select an agent file to open"});if(C){let S=y.join(f,C),P=await p.workspace.openTextDocument(S);await p.window.showTextDocument(P)}}catch(_){p.window.showErrorMessage(`Failed to list agent files: ${_}`)}}),p.commands.registerCommand("projectMemory.openPromptFile",async()=>{let f=p.workspace.getConfiguration("projectMemory").get("promptsRoot");if(!f){p.window.showErrorMessage("Prompts root not configured. Set projectMemory.promptsRoot in settings.");return}let m=require("fs"),y=require("path");try{let _=m.readdirSync(f).filter(S=>S.endsWith(".prompt.md")),C=await p.window.showQuickPick(_,{placeHolder:"Select a prompt file to open"});if(C){let S=y.join(f,C),P=await p.workspace.openTextDocument(S);await p.window.showTextDocument(P)}}catch(_){p.window.showErrorMessage(`Failed to list prompt files: ${_}`)}}),p.commands.registerCommand("projectMemory.showCopilotStatus",()=>{de.postMessage({type:"showCopilotStatus"}),p.commands.executeCommand("workbench.view.extension.projectMemory")}),p.commands.registerCommand("projectMemory.refreshData",()=>{de.postMessage({type:"refresh"})}),p.commands.registerCommand("projectMemory.openFile",async(l,f)=>{try{let m=await p.workspace.openTextDocument(l),y=await p.window.showTextDocument(m);if(f!==void 0){let _=new p.Position(f-1,0);y.selection=new p.Selection(_,_),y.revealRange(new p.Range(_,_),p.TextEditorRevealType.InCenter)}}catch{p.window.showErrorMessage(`Failed to open file: ${l}`)}}),p.commands.registerCommand("projectMemory.addToPlan",async l=>{let f,m,y;if(l)f=l.fsPath;else{let P=p.window.activeTextEditor;if(P){f=P.document.uri.fsPath;let $=P.selection;$.isEmpty||(m=P.document.getText($),y=$.start.line+1)}}if(!f){p.window.showErrorMessage("No file selected");return}if(!p.workspace.workspaceFolders){p.window.showErrorMessage("No workspace folder open");return}let C=await p.window.showInputBox({prompt:"Describe the step/task for this file",placeHolder:"e.g., Review and update authentication logic",value:m?`Review: ${m.substring(0,50)}...`:`Work on ${require("path").basename(f)}`});if(!C)return;let S=await p.window.showQuickPick(["investigation","research","analysis","planning","implementation","testing","validation","review","documentation","refactor","bugfix","handoff"],{placeHolder:"Select the phase for this step"});S&&(de.postMessage({type:"addStepToPlan",data:{task:C,phase:S,file:f,line:y,notes:m?`Selected code:
\`\`\`
${m.substring(0,500)}
\`\`\``:void 0}}),q(`Added step to plan: "${C}"`))})),n&&(rt=new $t(n,e.get("autoDeployAgents")||!1),rt.start(),s.subscriptions.push({dispose:()=>rt.stop()})),Oe=new Mt({agentsRoot:n,promptsRoot:o,instructionsRoot:i,autoDeploy:e.get("autoDeployAgents")||!1}),Oe.start(),Oe.onFileChanged((l,f,m)=>{m==="change"&&Gs.showTemporaryMessage(`${l} updated`)}),s.subscriptions.push({dispose:()=>Oe.stop()}),Gs=new Ft,s.subscriptions.push(Gs),s.subscriptions.push(p.workspace.onDidChangeConfiguration(l=>{if(l.affectsConfiguration("projectMemory")){let f=p.workspace.getConfiguration("projectMemory");de.updateConfig(f.get("dataRoot")||Qo(),f.get("agentsRoot")||Be())}})),console.log("Project Memory Dashboard extension activated")}async function _c(){console.log("Project Memory Dashboard extension deactivating..."),se&&(await se.disconnect(),se.dispose(),se=null),Re&&(Re.dispose(),Re=null),Ee&&(Ee.dispose(),Ee=null),de&&de.dispose(),rt&&rt.stop(),Oe&&Oe.stop(),D&&(await D.stopFrontend(),await D.stop(),await D.forceStopOwnedServer()),console.log("Project Memory Dashboard extension deactivated")}function Qo(){let s=p.workspace.workspaceFolders;if(s){let e=re(s[0].uri.fsPath);return e?Ae.join(e.projectPath,"data"):p.Uri.joinPath(s[0].uri,"data").fsPath}return""}function Be(){let s=p.workspace.workspaceFolders;if(s){let e=re(s[0].uri.fsPath);return e?Ae.join(e.projectPath,"agents"):p.Uri.joinPath(s[0].uri,"agents").fsPath}return""}function jt(){let s=p.workspace.workspaceFolders;if(s){let e=re(s[0].uri.fsPath);return e?Ae.join(e.projectPath,"instructions"):p.Uri.joinPath(s[0].uri,"instructions").fsPath}return""}function Xo(){let s=p.workspace.workspaceFolders;if(s){let e=re(s[0].uri.fsPath);return e?Ae.join(e.projectPath,"prompts"):p.Uri.joinPath(s[0].uri,"prompts").fsPath}return""}function kc(s,e,t){let n=e.get("chat.serverMode")||"bundled",o=e.get("chat.podmanImage")||"project-memory-mcp:latest",i=e.get("chat.externalServerPath")||"",r=e.get("chat.autoConnect")??!0;se=new tt({serverMode:n,podmanImage:o,externalServerPath:i,dataRoot:t}),s.subscriptions.push(se),se.onConnectionChange(a=>{a&&(Re?.resetWorkspace(),Ee?.resetWorkspace())}),Re=new st(se),s.subscriptions.push(Re),Ee=new nt(se),s.subscriptions.push(Ee),s.subscriptions.push(p.commands.registerCommand("projectMemory.chat.reconnect",async()=>{if(!se){p.window.showErrorMessage("MCP Bridge not initialized");return}try{await p.window.withProgress({location:p.ProgressLocation.Notification,title:"Reconnecting to MCP server...",cancellable:!1},async()=>{await se.reconnect()}),q("Connected to MCP server")}catch(a){let c=a instanceof Error?a.message:String(a);p.window.showErrorMessage(`Failed to connect: ${c}`),se.showLogs()}})),r&&se.connect().then(()=>{console.log("MCP Bridge connected")}).catch(a=>{console.warn("MCP Bridge auto-connect failed:",a)}),s.subscriptions.push(p.workspace.onDidChangeConfiguration(a=>{a.affectsConfiguration("projectMemory.chat")&&q("Chat configuration changed. Some changes may require reconnecting.","Reconnect").then(c=>{c==="Reconnect"&&p.commands.executeCommand("projectMemory.chat.reconnect")})})),s.subscriptions.push(p.workspace.onDidChangeWorkspaceFolders(()=>{Re?.resetWorkspace(),Ee?.resetWorkspace()})),console.log("Chat integration initialized")}0&&(module.exports={activate,deactivate});
/*! Bundled license information:

normalize-path/index.js:
  (*!
   * normalize-path <https://github.com/jonschlinkert/normalize-path>
   *
   * Copyright (c) 2014-2018, Jon Schlinkert.
   * Released under the MIT License.
   *)

is-extglob/index.js:
  (*!
   * is-extglob <https://github.com/jonschlinkert/is-extglob>
   *
   * Copyright (c) 2014-2016, Jon Schlinkert.
   * Licensed under the MIT License.
   *)

is-glob/index.js:
  (*!
   * is-glob <https://github.com/jonschlinkert/is-glob>
   *
   * Copyright (c) 2014-2017, Jon Schlinkert.
   * Released under the MIT License.
   *)

is-number/index.js:
  (*!
   * is-number <https://github.com/jonschlinkert/is-number>
   *
   * Copyright (c) 2014-present, Jon Schlinkert.
   * Released under the MIT License.
   *)

to-regex-range/index.js:
  (*!
   * to-regex-range <https://github.com/micromatch/to-regex-range>
   *
   * Copyright (c) 2015-present, Jon Schlinkert.
   * Released under the MIT License.
   *)

fill-range/index.js:
  (*!
   * fill-range <https://github.com/jonschlinkert/fill-range>
   *
   * Copyright (c) 2014-present, Jon Schlinkert.
   * Licensed under the MIT License.
   *)
*/
