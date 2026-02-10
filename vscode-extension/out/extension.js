"use strict";var hi=Object.create;var $t=Object.defineProperty;var fi=Object.getOwnPropertyDescriptor;var gi=Object.getOwnPropertyNames;var mi=Object.getPrototypeOf,wi=Object.prototype.hasOwnProperty;var H=(n,e)=>()=>(e||n((e={exports:{}}).exports,e),e.exports),vi=(n,e)=>{for(var t in e)$t(n,t,{get:e[t],enumerable:!0})},zn=(n,e,t,o)=>{if(e&&typeof e=="object"||typeof e=="function")for(let s of gi(e))!wi.call(n,s)&&s!==t&&$t(n,s,{get:()=>e[s],enumerable:!(o=fi(e,s))||o.enumerable});return n};var P=(n,e,t)=>(t=n!=null?hi(mi(n)):{},zn(e||!n||!n.__esModule?$t(t,"default",{value:n,enumerable:!0}):t,n)),yi=n=>zn($t({},"__esModule",{value:!0}),n);var ut=H((ql,no)=>{"use strict";var _i=require("path"),ke="\\\\/",Zn=`[^${ke}]`,Pe="\\.",ki="\\+",xi="\\?",Lt="\\/",Ci="(?=.)",eo="[^/]",Rs=`(?:${Lt}|$)`,to=`(?:^|${Lt})`,Es=`${Pe}{1,2}${Rs}`,Pi=`(?!${Pe})`,Si=`(?!${to}${Es})`,Ri=`(?!${Pe}{0,1}${Rs})`,Ei=`(?!${Es})`,Ti=`[^.${Lt}]`,Ii=`${eo}*?`,so={DOT_LITERAL:Pe,PLUS_LITERAL:ki,QMARK_LITERAL:xi,SLASH_LITERAL:Lt,ONE_CHAR:Ci,QMARK:eo,END_ANCHOR:Rs,DOTS_SLASH:Es,NO_DOT:Pi,NO_DOTS:Si,NO_DOT_SLASH:Ri,NO_DOTS_SLASH:Ei,QMARK_NO_DOT:Ti,STAR:Ii,START_ANCHOR:to},Ai={...so,SLASH_LITERAL:`[${ke}]`,QMARK:Zn,STAR:`${Zn}*?`,DOTS_SLASH:`${Pe}{1,2}(?:[${ke}]|$)`,NO_DOT:`(?!${Pe})`,NO_DOTS:`(?!(?:^|[${ke}])${Pe}{1,2}(?:[${ke}]|$))`,NO_DOT_SLASH:`(?!${Pe}{0,1}(?:[${ke}]|$))`,NO_DOTS_SLASH:`(?!${Pe}{1,2}(?:[${ke}]|$))`,QMARK_NO_DOT:`[^.${ke}]`,START_ANCHOR:`(?:^|[${ke}])`,END_ANCHOR:`(?:[${ke}]|$)`},Mi={alnum:"a-zA-Z0-9",alpha:"a-zA-Z",ascii:"\\x00-\\x7F",blank:" \\t",cntrl:"\\x00-\\x1F\\x7F",digit:"0-9",graph:"\\x21-\\x7E",lower:"a-z",print:"\\x20-\\x7E ",punct:"\\-!\"#$%&'()\\*+,./:;<=>?@[\\]^_`{|}~",space:" \\t\\r\\n\\v\\f",upper:"A-Z",word:"A-Za-z0-9_",xdigit:"A-Fa-f0-9"};no.exports={MAX_LENGTH:1024*64,POSIX_REGEX_SOURCE:Mi,REGEX_BACKSLASH:/\\(?![*+?^${}(|)[\]])/g,REGEX_NON_SPECIAL_CHARS:/^[^@![\].,$*+?^{}()|\\/]+/,REGEX_SPECIAL_CHARS:/[-*+?.^${}(|)[\]]/,REGEX_SPECIAL_CHARS_BACKREF:/(\\?)((\W)(\3*))/g,REGEX_SPECIAL_CHARS_GLOBAL:/([-*+?.^${}(|)[\]])/g,REGEX_REMOVE_BACKSLASH:/(?:\[.*?[^\\]\]|\\(?=.))/g,REPLACEMENTS:{"***":"*","**/**":"**","**/**/**":"**"},CHAR_0:48,CHAR_9:57,CHAR_UPPERCASE_A:65,CHAR_LOWERCASE_A:97,CHAR_UPPERCASE_Z:90,CHAR_LOWERCASE_Z:122,CHAR_LEFT_PARENTHESES:40,CHAR_RIGHT_PARENTHESES:41,CHAR_ASTERISK:42,CHAR_AMPERSAND:38,CHAR_AT:64,CHAR_BACKWARD_SLASH:92,CHAR_CARRIAGE_RETURN:13,CHAR_CIRCUMFLEX_ACCENT:94,CHAR_COLON:58,CHAR_COMMA:44,CHAR_DOT:46,CHAR_DOUBLE_QUOTE:34,CHAR_EQUAL:61,CHAR_EXCLAMATION_MARK:33,CHAR_FORM_FEED:12,CHAR_FORWARD_SLASH:47,CHAR_GRAVE_ACCENT:96,CHAR_HASH:35,CHAR_HYPHEN_MINUS:45,CHAR_LEFT_ANGLE_BRACKET:60,CHAR_LEFT_CURLY_BRACE:123,CHAR_LEFT_SQUARE_BRACKET:91,CHAR_LINE_FEED:10,CHAR_NO_BREAK_SPACE:160,CHAR_PERCENT:37,CHAR_PLUS:43,CHAR_QUESTION_MARK:63,CHAR_RIGHT_ANGLE_BRACKET:62,CHAR_RIGHT_CURLY_BRACE:125,CHAR_RIGHT_SQUARE_BRACKET:93,CHAR_SEMICOLON:59,CHAR_SINGLE_QUOTE:39,CHAR_SPACE:32,CHAR_TAB:9,CHAR_UNDERSCORE:95,CHAR_VERTICAL_LINE:124,CHAR_ZERO_WIDTH_NOBREAK_SPACE:65279,SEP:_i.sep,extglobChars(n){return{"!":{type:"negate",open:"(?:(?!(?:",close:`))${n.STAR})`},"?":{type:"qmark",open:"(?:",close:")?"},"+":{type:"plus",open:"(?:",close:")+"},"*":{type:"star",open:"(?:",close:")*"},"@":{type:"at",open:"(?:",close:")"}}},globChars(n){return n===!0?Ai:so}}});var Bt=H(ce=>{"use strict";var $i=require("path"),Di=process.platform==="win32",{REGEX_BACKSLASH:Fi,REGEX_REMOVE_BACKSLASH:Li,REGEX_SPECIAL_CHARS:Bi,REGEX_SPECIAL_CHARS_GLOBAL:Hi}=ut();ce.isObject=n=>n!==null&&typeof n=="object"&&!Array.isArray(n);ce.hasRegexChars=n=>Bi.test(n);ce.isRegexChar=n=>n.length===1&&ce.hasRegexChars(n);ce.escapeRegex=n=>n.replace(Hi,"\\$1");ce.toPosixSlashes=n=>n.replace(Fi,"/");ce.removeBackslashes=n=>n.replace(Li,e=>e==="\\"?"":e);ce.supportsLookbehinds=()=>{let n=process.version.slice(1).split(".").map(Number);return n.length===3&&n[0]>=9||n[0]===8&&n[1]>=10};ce.isWindows=n=>n&&typeof n.windows=="boolean"?n.windows:Di===!0||$i.sep==="\\";ce.escapeLast=(n,e,t)=>{let o=n.lastIndexOf(e,t);return o===-1?n:n[o-1]==="\\"?ce.escapeLast(n,e,o-1):`${n.slice(0,o)}\\${n.slice(o)}`};ce.removePrefix=(n,e={})=>{let t=n;return t.startsWith("./")&&(t=t.slice(2),e.prefix="./"),t};ce.wrapOutput=(n,e={},t={})=>{let o=t.contains?"":"^",s=t.contains?"":"$",r=`${o}(?:${n})${s}`;return e.negated===!0&&(r=`(?:^(?!${r}).*$)`),r}});var uo=H((Gl,po)=>{"use strict";var oo=Bt(),{CHAR_ASTERISK:Ts,CHAR_AT:Ni,CHAR_BACKWARD_SLASH:ht,CHAR_COMMA:Oi,CHAR_DOT:Is,CHAR_EXCLAMATION_MARK:As,CHAR_FORWARD_SLASH:lo,CHAR_LEFT_CURLY_BRACE:Ms,CHAR_LEFT_PARENTHESES:$s,CHAR_LEFT_SQUARE_BRACKET:ji,CHAR_PLUS:Wi,CHAR_QUESTION_MARK:ro,CHAR_RIGHT_CURLY_BRACE:qi,CHAR_RIGHT_PARENTHESES:io,CHAR_RIGHT_SQUARE_BRACKET:Ui}=ut(),ao=n=>n===lo||n===ht,co=n=>{n.isPrefix!==!0&&(n.depth=n.isGlobstar?1/0:1)},Gi=(n,e)=>{let t=e||{},o=n.length-1,s=t.parts===!0||t.scanToEnd===!0,r=[],i=[],a=[],c=n,l=-1,u=0,d=0,p=!1,h=!1,w=!1,v=!1,_=!1,D=!1,x=!1,S=!1,V=!1,W=!1,he=0,ne,E,B={value:"",depth:0,isGlob:!1},Z=()=>l>=o,m=()=>c.charCodeAt(l+1),q=()=>(ne=E,c.charCodeAt(++l));for(;l<o;){E=q();let oe;if(E===ht){x=B.backslashes=!0,E=q(),E===Ms&&(D=!0);continue}if(D===!0||E===Ms){for(he++;Z()!==!0&&(E=q());){if(E===ht){x=B.backslashes=!0,q();continue}if(E===Ms){he++;continue}if(D!==!0&&E===Is&&(E=q())===Is){if(p=B.isBrace=!0,w=B.isGlob=!0,W=!0,s===!0)continue;break}if(D!==!0&&E===Oi){if(p=B.isBrace=!0,w=B.isGlob=!0,W=!0,s===!0)continue;break}if(E===qi&&(he--,he===0)){D=!1,p=B.isBrace=!0,W=!0;break}}if(s===!0)continue;break}if(E===lo){if(r.push(l),i.push(B),B={value:"",depth:0,isGlob:!1},W===!0)continue;if(ne===Is&&l===u+1){u+=2;continue}d=l+1;continue}if(t.noext!==!0&&(E===Wi||E===Ni||E===Ts||E===ro||E===As)===!0&&m()===$s){if(w=B.isGlob=!0,v=B.isExtglob=!0,W=!0,E===As&&l===u&&(V=!0),s===!0){for(;Z()!==!0&&(E=q());){if(E===ht){x=B.backslashes=!0,E=q();continue}if(E===io){w=B.isGlob=!0,W=!0;break}}continue}break}if(E===Ts){if(ne===Ts&&(_=B.isGlobstar=!0),w=B.isGlob=!0,W=!0,s===!0)continue;break}if(E===ro){if(w=B.isGlob=!0,W=!0,s===!0)continue;break}if(E===ji){for(;Z()!==!0&&(oe=q());){if(oe===ht){x=B.backslashes=!0,q();continue}if(oe===Ui){h=B.isBracket=!0,w=B.isGlob=!0,W=!0;break}}if(s===!0)continue;break}if(t.nonegate!==!0&&E===As&&l===u){S=B.negated=!0,u++;continue}if(t.noparen!==!0&&E===$s){if(w=B.isGlob=!0,s===!0){for(;Z()!==!0&&(E=q());){if(E===$s){x=B.backslashes=!0,E=q();continue}if(E===io){W=!0;break}}continue}break}if(w===!0){if(W=!0,s===!0)continue;break}}t.noext===!0&&(v=!1,w=!1);let O=c,Ie="",f="";u>0&&(Ie=c.slice(0,u),c=c.slice(u),d-=u),O&&w===!0&&d>0?(O=c.slice(0,d),f=c.slice(d)):w===!0?(O="",f=c):O=c,O&&O!==""&&O!=="/"&&O!==c&&ao(O.charCodeAt(O.length-1))&&(O=O.slice(0,-1)),t.unescape===!0&&(f&&(f=oo.removeBackslashes(f)),O&&x===!0&&(O=oo.removeBackslashes(O)));let g={prefix:Ie,input:n,start:u,base:O,glob:f,isBrace:p,isBracket:h,isGlob:w,isExtglob:v,isGlobstar:_,negated:S,negatedExtglob:V};if(t.tokens===!0&&(g.maxDepth=0,ao(E)||i.push(B),g.tokens=i),t.parts===!0||t.tokens===!0){let oe;for(let $=0;$<r.length;$++){let be=oe?oe+1:u,_e=r[$],de=n.slice(be,_e);t.tokens&&($===0&&u!==0?(i[$].isPrefix=!0,i[$].value=Ie):i[$].value=de,co(i[$]),g.maxDepth+=i[$].depth),($!==0||de!=="")&&a.push(de),oe=_e}if(oe&&oe+1<n.length){let $=n.slice(oe+1);a.push($),t.tokens&&(i[i.length-1].value=$,co(i[i.length-1]),g.maxDepth+=i[i.length-1].depth)}g.slashes=r,g.parts=a}return g};po.exports=Gi});var go=H((Vl,fo)=>{"use strict";var Ht=ut(),pe=Bt(),{MAX_LENGTH:Nt,POSIX_REGEX_SOURCE:Vi,REGEX_NON_SPECIAL_CHARS:zi,REGEX_SPECIAL_CHARS_BACKREF:Ki,REPLACEMENTS:ho}=Ht,Yi=(n,e)=>{if(typeof e.expandRange=="function")return e.expandRange(...n,e);n.sort();let t=`[${n.join("-")}]`;try{new RegExp(t)}catch{return n.map(s=>pe.escapeRegex(s)).join("..")}return t},ze=(n,e)=>`Missing ${n}: "${e}" - use "\\\\${e}" to match literal characters`,Ds=(n,e)=>{if(typeof n!="string")throw new TypeError("Expected a string");n=ho[n]||n;let t={...e},o=typeof t.maxLength=="number"?Math.min(Nt,t.maxLength):Nt,s=n.length;if(s>o)throw new SyntaxError(`Input length: ${s}, exceeds maximum allowed length: ${o}`);let r={type:"bos",value:"",output:t.prepend||""},i=[r],a=t.capture?"":"?:",c=pe.isWindows(e),l=Ht.globChars(c),u=Ht.extglobChars(l),{DOT_LITERAL:d,PLUS_LITERAL:p,SLASH_LITERAL:h,ONE_CHAR:w,DOTS_SLASH:v,NO_DOT:_,NO_DOT_SLASH:D,NO_DOTS_SLASH:x,QMARK:S,QMARK_NO_DOT:V,STAR:W,START_ANCHOR:he}=l,ne=b=>`(${a}(?:(?!${he}${b.dot?v:d}).)*?)`,E=t.dot?"":_,B=t.dot?S:V,Z=t.bash===!0?ne(t):W;t.capture&&(Z=`(${Z})`),typeof t.noext=="boolean"&&(t.noextglob=t.noext);let m={input:n,index:-1,start:0,dot:t.dot===!0,consumed:"",output:"",prefix:"",backtrack:!1,negated:!1,brackets:0,braces:0,parens:0,quotes:0,globstar:!1,tokens:i};n=pe.removePrefix(n,m),s=n.length;let q=[],O=[],Ie=[],f=r,g,oe=()=>m.index===s-1,$=m.peek=(b=1)=>n[m.index+b],be=m.advance=()=>n[++m.index]||"",_e=()=>n.slice(m.index+1),de=(b="",j=0)=>{m.consumed+=b,m.index+=j},Tt=b=>{m.output+=b.output!=null?b.output:b.value,de(b.value)},pi=()=>{let b=1;for(;$()==="!"&&($(2)!=="("||$(3)==="?");)be(),m.start++,b++;return b%2===0?!1:(m.negated=!0,m.start++,!0)},It=b=>{m[b]++,Ie.push(b)},Be=b=>{m[b]--,Ie.pop()},A=b=>{if(f.type==="globstar"){let j=m.braces>0&&(b.type==="comma"||b.type==="brace"),y=b.extglob===!0||q.length&&(b.type==="pipe"||b.type==="paren");b.type!=="slash"&&b.type!=="paren"&&!j&&!y&&(m.output=m.output.slice(0,-f.output.length),f.type="star",f.value="*",f.output=Z,m.output+=f.output)}if(q.length&&b.type!=="paren"&&(q[q.length-1].inner+=b.value),(b.value||b.output)&&Tt(b),f&&f.type==="text"&&b.type==="text"){f.value+=b.value,f.output=(f.output||"")+b.value;return}b.prev=f,i.push(b),f=b},At=(b,j)=>{let y={...u[j],conditions:1,inner:""};y.prev=f,y.parens=m.parens,y.output=m.output;let T=(t.capture?"(":"")+y.open;It("parens"),A({type:b,value:j,output:m.output?"":w}),A({type:"paren",extglob:!0,value:be(),output:T}),q.push(y)},ui=b=>{let j=b.close+(t.capture?")":""),y;if(b.type==="negate"){let T=Z;if(b.inner&&b.inner.length>1&&b.inner.includes("/")&&(T=ne(t)),(T!==Z||oe()||/^\)+$/.test(_e()))&&(j=b.close=`)$))${T}`),b.inner.includes("*")&&(y=_e())&&/^\.[^\\/.]+$/.test(y)){let G=Ds(y,{...e,fastpaths:!1}).output;j=b.close=`)${G})${T})`}b.prev.type==="bos"&&(m.negatedExtglob=!0)}A({type:"paren",extglob:!0,value:g,output:j}),Be("parens")};if(t.fastpaths!==!1&&!/(^[*!]|[/()[\]{}"])/.test(n)){let b=!1,j=n.replace(Ki,(y,T,G,re,K,xs)=>re==="\\"?(b=!0,y):re==="?"?T?T+re+(K?S.repeat(K.length):""):xs===0?B+(K?S.repeat(K.length):""):S.repeat(G.length):re==="."?d.repeat(G.length):re==="*"?T?T+re+(K?Z:""):Z:T?y:`\\${y}`);return b===!0&&(t.unescape===!0?j=j.replace(/\\/g,""):j=j.replace(/\\+/g,y=>y.length%2===0?"\\\\":y?"\\":"")),j===n&&t.contains===!0?(m.output=n,m):(m.output=pe.wrapOutput(j,m,e),m)}for(;!oe();){if(g=be(),g==="\0")continue;if(g==="\\"){let y=$();if(y==="/"&&t.bash!==!0||y==="."||y===";")continue;if(!y){g+="\\",A({type:"text",value:g});continue}let T=/^\\+/.exec(_e()),G=0;if(T&&T[0].length>2&&(G=T[0].length,m.index+=G,G%2!==0&&(g+="\\")),t.unescape===!0?g=be():g+=be(),m.brackets===0){A({type:"text",value:g});continue}}if(m.brackets>0&&(g!=="]"||f.value==="["||f.value==="[^")){if(t.posix!==!1&&g===":"){let y=f.value.slice(1);if(y.includes("[")&&(f.posix=!0,y.includes(":"))){let T=f.value.lastIndexOf("["),G=f.value.slice(0,T),re=f.value.slice(T+2),K=Vi[re];if(K){f.value=G+K,m.backtrack=!0,be(),!r.output&&i.indexOf(f)===1&&(r.output=w);continue}}}(g==="["&&$()!==":"||g==="-"&&$()==="]")&&(g=`\\${g}`),g==="]"&&(f.value==="["||f.value==="[^")&&(g=`\\${g}`),t.posix===!0&&g==="!"&&f.value==="["&&(g="^"),f.value+=g,Tt({value:g});continue}if(m.quotes===1&&g!=='"'){g=pe.escapeRegex(g),f.value+=g,Tt({value:g});continue}if(g==='"'){m.quotes=m.quotes===1?0:1,t.keepQuotes===!0&&A({type:"text",value:g});continue}if(g==="("){It("parens"),A({type:"paren",value:g});continue}if(g===")"){if(m.parens===0&&t.strictBrackets===!0)throw new SyntaxError(ze("opening","("));let y=q[q.length-1];if(y&&m.parens===y.parens+1){ui(q.pop());continue}A({type:"paren",value:g,output:m.parens?")":"\\)"}),Be("parens");continue}if(g==="["){if(t.nobracket===!0||!_e().includes("]")){if(t.nobracket!==!0&&t.strictBrackets===!0)throw new SyntaxError(ze("closing","]"));g=`\\${g}`}else It("brackets");A({type:"bracket",value:g});continue}if(g==="]"){if(t.nobracket===!0||f&&f.type==="bracket"&&f.value.length===1){A({type:"text",value:g,output:`\\${g}`});continue}if(m.brackets===0){if(t.strictBrackets===!0)throw new SyntaxError(ze("opening","["));A({type:"text",value:g,output:`\\${g}`});continue}Be("brackets");let y=f.value.slice(1);if(f.posix!==!0&&y[0]==="^"&&!y.includes("/")&&(g=`/${g}`),f.value+=g,Tt({value:g}),t.literalBrackets===!1||pe.hasRegexChars(y))continue;let T=pe.escapeRegex(f.value);if(m.output=m.output.slice(0,-f.value.length),t.literalBrackets===!0){m.output+=T,f.value=T;continue}f.value=`(${a}${T}|${f.value})`,m.output+=f.value;continue}if(g==="{"&&t.nobrace!==!0){It("braces");let y={type:"brace",value:g,output:"(",outputIndex:m.output.length,tokensIndex:m.tokens.length};O.push(y),A(y);continue}if(g==="}"){let y=O[O.length-1];if(t.nobrace===!0||!y){A({type:"text",value:g,output:g});continue}let T=")";if(y.dots===!0){let G=i.slice(),re=[];for(let K=G.length-1;K>=0&&(i.pop(),G[K].type!=="brace");K--)G[K].type!=="dots"&&re.unshift(G[K].value);T=Yi(re,t),m.backtrack=!0}if(y.comma!==!0&&y.dots!==!0){let G=m.output.slice(0,y.outputIndex),re=m.tokens.slice(y.tokensIndex);y.value=y.output="\\{",g=T="\\}",m.output=G;for(let K of re)m.output+=K.output||K.value}A({type:"brace",value:g,output:T}),Be("braces"),O.pop();continue}if(g==="|"){q.length>0&&q[q.length-1].conditions++,A({type:"text",value:g});continue}if(g===","){let y=g,T=O[O.length-1];T&&Ie[Ie.length-1]==="braces"&&(T.comma=!0,y="|"),A({type:"comma",value:g,output:y});continue}if(g==="/"){if(f.type==="dot"&&m.index===m.start+1){m.start=m.index+1,m.consumed="",m.output="",i.pop(),f=r;continue}A({type:"slash",value:g,output:h});continue}if(g==="."){if(m.braces>0&&f.type==="dot"){f.value==="."&&(f.output=d);let y=O[O.length-1];f.type="dots",f.output+=g,f.value+=g,y.dots=!0;continue}if(m.braces+m.parens===0&&f.type!=="bos"&&f.type!=="slash"){A({type:"text",value:g,output:d});continue}A({type:"dot",value:g,output:d});continue}if(g==="?"){if(!(f&&f.value==="(")&&t.noextglob!==!0&&$()==="("&&$(2)!=="?"){At("qmark",g);continue}if(f&&f.type==="paren"){let T=$(),G=g;if(T==="<"&&!pe.supportsLookbehinds())throw new Error("Node.js v10 or higher is required for regex lookbehinds");(f.value==="("&&!/[!=<:]/.test(T)||T==="<"&&!/<([!=]|\w+>)/.test(_e()))&&(G=`\\${g}`),A({type:"text",value:g,output:G});continue}if(t.dot!==!0&&(f.type==="slash"||f.type==="bos")){A({type:"qmark",value:g,output:V});continue}A({type:"qmark",value:g,output:S});continue}if(g==="!"){if(t.noextglob!==!0&&$()==="("&&($(2)!=="?"||!/[!=<:]/.test($(3)))){At("negate",g);continue}if(t.nonegate!==!0&&m.index===0){pi();continue}}if(g==="+"){if(t.noextglob!==!0&&$()==="("&&$(2)!=="?"){At("plus",g);continue}if(f&&f.value==="("||t.regex===!1){A({type:"plus",value:g,output:p});continue}if(f&&(f.type==="bracket"||f.type==="paren"||f.type==="brace")||m.parens>0){A({type:"plus",value:g});continue}A({type:"plus",value:p});continue}if(g==="@"){if(t.noextglob!==!0&&$()==="("&&$(2)!=="?"){A({type:"at",extglob:!0,value:g,output:""});continue}A({type:"text",value:g});continue}if(g!=="*"){(g==="$"||g==="^")&&(g=`\\${g}`);let y=zi.exec(_e());y&&(g+=y[0],m.index+=y[0].length),A({type:"text",value:g});continue}if(f&&(f.type==="globstar"||f.star===!0)){f.type="star",f.star=!0,f.value+=g,f.output=Z,m.backtrack=!0,m.globstar=!0,de(g);continue}let b=_e();if(t.noextglob!==!0&&/^\([^?]/.test(b)){At("star",g);continue}if(f.type==="star"){if(t.noglobstar===!0){de(g);continue}let y=f.prev,T=y.prev,G=y.type==="slash"||y.type==="bos",re=T&&(T.type==="star"||T.type==="globstar");if(t.bash===!0&&(!G||b[0]&&b[0]!=="/")){A({type:"star",value:g,output:""});continue}let K=m.braces>0&&(y.type==="comma"||y.type==="brace"),xs=q.length&&(y.type==="pipe"||y.type==="paren");if(!G&&y.type!=="paren"&&!K&&!xs){A({type:"star",value:g,output:""});continue}for(;b.slice(0,3)==="/**";){let Mt=n[m.index+4];if(Mt&&Mt!=="/")break;b=b.slice(3),de("/**",3)}if(y.type==="bos"&&oe()){f.type="globstar",f.value+=g,f.output=ne(t),m.output=f.output,m.globstar=!0,de(g);continue}if(y.type==="slash"&&y.prev.type!=="bos"&&!re&&oe()){m.output=m.output.slice(0,-(y.output+f.output).length),y.output=`(?:${y.output}`,f.type="globstar",f.output=ne(t)+(t.strictSlashes?")":"|$)"),f.value+=g,m.globstar=!0,m.output+=y.output+f.output,de(g);continue}if(y.type==="slash"&&y.prev.type!=="bos"&&b[0]==="/"){let Mt=b[1]!==void 0?"|$":"";m.output=m.output.slice(0,-(y.output+f.output).length),y.output=`(?:${y.output}`,f.type="globstar",f.output=`${ne(t)}${h}|${h}${Mt})`,f.value+=g,m.output+=y.output+f.output,m.globstar=!0,de(g+be()),A({type:"slash",value:"/",output:""});continue}if(y.type==="bos"&&b[0]==="/"){f.type="globstar",f.value+=g,f.output=`(?:^|${h}|${ne(t)}${h})`,m.output=f.output,m.globstar=!0,de(g+be()),A({type:"slash",value:"/",output:""});continue}m.output=m.output.slice(0,-f.output.length),f.type="globstar",f.output=ne(t),f.value+=g,m.output+=f.output,m.globstar=!0,de(g);continue}let j={type:"star",value:g,output:Z};if(t.bash===!0){j.output=".*?",(f.type==="bos"||f.type==="slash")&&(j.output=E+j.output),A(j);continue}if(f&&(f.type==="bracket"||f.type==="paren")&&t.regex===!0){j.output=g,A(j);continue}(m.index===m.start||f.type==="slash"||f.type==="dot")&&(f.type==="dot"?(m.output+=D,f.output+=D):t.dot===!0?(m.output+=x,f.output+=x):(m.output+=E,f.output+=E),$()!=="*"&&(m.output+=w,f.output+=w)),A(j)}for(;m.brackets>0;){if(t.strictBrackets===!0)throw new SyntaxError(ze("closing","]"));m.output=pe.escapeLast(m.output,"["),Be("brackets")}for(;m.parens>0;){if(t.strictBrackets===!0)throw new SyntaxError(ze("closing",")"));m.output=pe.escapeLast(m.output,"("),Be("parens")}for(;m.braces>0;){if(t.strictBrackets===!0)throw new SyntaxError(ze("closing","}"));m.output=pe.escapeLast(m.output,"{"),Be("braces")}if(t.strictSlashes!==!0&&(f.type==="star"||f.type==="bracket")&&A({type:"maybe_slash",value:"",output:`${h}?`}),m.backtrack===!0){m.output="";for(let b of m.tokens)m.output+=b.output!=null?b.output:b.value,b.suffix&&(m.output+=b.suffix)}return m};Ds.fastpaths=(n,e)=>{let t={...e},o=typeof t.maxLength=="number"?Math.min(Nt,t.maxLength):Nt,s=n.length;if(s>o)throw new SyntaxError(`Input length: ${s}, exceeds maximum allowed length: ${o}`);n=ho[n]||n;let r=pe.isWindows(e),{DOT_LITERAL:i,SLASH_LITERAL:a,ONE_CHAR:c,DOTS_SLASH:l,NO_DOT:u,NO_DOTS:d,NO_DOTS_SLASH:p,STAR:h,START_ANCHOR:w}=Ht.globChars(r),v=t.dot?d:u,_=t.dot?p:u,D=t.capture?"":"?:",x={negated:!1,prefix:""},S=t.bash===!0?".*?":h;t.capture&&(S=`(${S})`);let V=E=>E.noglobstar===!0?S:`(${D}(?:(?!${w}${E.dot?l:i}).)*?)`,W=E=>{switch(E){case"*":return`${v}${c}${S}`;case".*":return`${i}${c}${S}`;case"*.*":return`${v}${S}${i}${c}${S}`;case"*/*":return`${v}${S}${a}${c}${_}${S}`;case"**":return v+V(t);case"**/*":return`(?:${v}${V(t)}${a})?${_}${c}${S}`;case"**/*.*":return`(?:${v}${V(t)}${a})?${_}${S}${i}${c}${S}`;case"**/.*":return`(?:${v}${V(t)}${a})?${i}${c}${S}`;default:{let B=/^(.*?)\.(\w+)$/.exec(E);if(!B)return;let Z=W(B[1]);return Z?Z+i+B[2]:void 0}}},he=pe.removePrefix(n,x),ne=W(he);return ne&&t.strictSlashes!==!0&&(ne+=`${a}?`),ne};fo.exports=Ds});var wo=H((zl,mo)=>{"use strict";var Qi=require("path"),Xi=uo(),Fs=go(),Ls=Bt(),Ji=ut(),Zi=n=>n&&typeof n=="object"&&!Array.isArray(n),z=(n,e,t=!1)=>{if(Array.isArray(n)){let u=n.map(p=>z(p,e,t));return p=>{for(let h of u){let w=h(p);if(w)return w}return!1}}let o=Zi(n)&&n.tokens&&n.input;if(n===""||typeof n!="string"&&!o)throw new TypeError("Expected pattern to be a non-empty string");let s=e||{},r=Ls.isWindows(e),i=o?z.compileRe(n,e):z.makeRe(n,e,!1,!0),a=i.state;delete i.state;let c=()=>!1;if(s.ignore){let u={...e,ignore:null,onMatch:null,onResult:null};c=z(s.ignore,u,t)}let l=(u,d=!1)=>{let{isMatch:p,match:h,output:w}=z.test(u,i,e,{glob:n,posix:r}),v={glob:n,state:a,regex:i,posix:r,input:u,output:w,match:h,isMatch:p};return typeof s.onResult=="function"&&s.onResult(v),p===!1?(v.isMatch=!1,d?v:!1):c(u)?(typeof s.onIgnore=="function"&&s.onIgnore(v),v.isMatch=!1,d?v:!1):(typeof s.onMatch=="function"&&s.onMatch(v),d?v:!0)};return t&&(l.state=a),l};z.test=(n,e,t,{glob:o,posix:s}={})=>{if(typeof n!="string")throw new TypeError("Expected input to be a string");if(n==="")return{isMatch:!1,output:""};let r=t||{},i=r.format||(s?Ls.toPosixSlashes:null),a=n===o,c=a&&i?i(n):n;return a===!1&&(c=i?i(n):n,a=c===o),(a===!1||r.capture===!0)&&(r.matchBase===!0||r.basename===!0?a=z.matchBase(n,e,t,s):a=e.exec(c)),{isMatch:!!a,match:a,output:c}};z.matchBase=(n,e,t,o=Ls.isWindows(t))=>(e instanceof RegExp?e:z.makeRe(e,t)).test(Qi.basename(n));z.isMatch=(n,e,t)=>z(e,t)(n);z.parse=(n,e)=>Array.isArray(n)?n.map(t=>z.parse(t,e)):Fs(n,{...e,fastpaths:!1});z.scan=(n,e)=>Xi(n,e);z.compileRe=(n,e,t=!1,o=!1)=>{if(t===!0)return n.output;let s=e||{},r=s.contains?"":"^",i=s.contains?"":"$",a=`${r}(?:${n.output})${i}`;n&&n.negated===!0&&(a=`^(?!${a}).*$`);let c=z.toRegex(a,e);return o===!0&&(c.state=n),c};z.makeRe=(n,e={},t=!1,o=!1)=>{if(!n||typeof n!="string")throw new TypeError("Expected a non-empty string");let s={negated:!1,fastpaths:!0};return e.fastpaths!==!1&&(n[0]==="."||n[0]==="*")&&(s.output=Fs.fastpaths(n,e)),s.output||(s=Fs(n,e)),z.compileRe(s,e,t,o)};z.toRegex=(n,e)=>{try{let t=e||{};return new RegExp(n,t.flags||(t.nocase?"i":""))}catch(t){if(e&&e.debug===!0)throw t;return/$^/}};z.constants=Ji;mo.exports=z});var Bs=H((Kl,vo)=>{"use strict";vo.exports=wo()});var So=H((Yl,Po)=>{"use strict";var gt=require("fs"),{Readable:ea}=require("stream"),ft=require("path"),{promisify:qt}=require("util"),Hs=Bs(),ta=qt(gt.readdir),sa=qt(gt.stat),yo=qt(gt.lstat),na=qt(gt.realpath),oa="!",xo="READDIRP_RECURSIVE_ERROR",ra=new Set(["ENOENT","EPERM","EACCES","ELOOP",xo]),Ns="files",Co="directories",jt="files_directories",Ot="all",bo=[Ns,Co,jt,Ot],ia=n=>ra.has(n.code),[_o,aa]=process.versions.node.split(".").slice(0,2).map(n=>Number.parseInt(n,10)),ca=process.platform==="win32"&&(_o>10||_o===10&&aa>=5),ko=n=>{if(n!==void 0){if(typeof n=="function")return n;if(typeof n=="string"){let e=Hs(n.trim());return t=>e(t.basename)}if(Array.isArray(n)){let e=[],t=[];for(let o of n){let s=o.trim();s.charAt(0)===oa?t.push(Hs(s.slice(1))):e.push(Hs(s))}return t.length>0?e.length>0?o=>e.some(s=>s(o.basename))&&!t.some(s=>s(o.basename)):o=>!t.some(s=>s(o.basename)):o=>e.some(s=>s(o.basename))}}},Wt=class n extends ea{static get defaultOptions(){return{root:".",fileFilter:e=>!0,directoryFilter:e=>!0,type:Ns,lstat:!1,depth:2147483648,alwaysStat:!1}}constructor(e={}){super({objectMode:!0,autoDestroy:!0,highWaterMark:e.highWaterMark||4096});let t={...n.defaultOptions,...e},{root:o,type:s}=t;this._fileFilter=ko(t.fileFilter),this._directoryFilter=ko(t.directoryFilter);let r=t.lstat?yo:sa;ca?this._stat=i=>r(i,{bigint:!0}):this._stat=r,this._maxDepth=t.depth,this._wantsDir=[Co,jt,Ot].includes(s),this._wantsFile=[Ns,jt,Ot].includes(s),this._wantsEverything=s===Ot,this._root=ft.resolve(o),this._isDirent="Dirent"in gt&&!t.alwaysStat,this._statsProp=this._isDirent?"dirent":"stats",this._rdOptions={encoding:"utf8",withFileTypes:this._isDirent},this.parents=[this._exploreDir(o,1)],this.reading=!1,this.parent=void 0}async _read(e){if(!this.reading){this.reading=!0;try{for(;!this.destroyed&&e>0;){let{path:t,depth:o,files:s=[]}=this.parent||{};if(s.length>0){let r=s.splice(0,e).map(i=>this._formatEntry(i,t));for(let i of await Promise.all(r)){if(this.destroyed)return;let a=await this._getEntryType(i);a==="directory"&&this._directoryFilter(i)?(o<=this._maxDepth&&this.parents.push(this._exploreDir(i.fullPath,o+1)),this._wantsDir&&(this.push(i),e--)):(a==="file"||this._includeAsFile(i))&&this._fileFilter(i)&&this._wantsFile&&(this.push(i),e--)}}else{let r=this.parents.pop();if(!r){this.push(null);break}if(this.parent=await r,this.destroyed)return}}}catch(t){this.destroy(t)}finally{this.reading=!1}}}async _exploreDir(e,t){let o;try{o=await ta(e,this._rdOptions)}catch(s){this._onError(s)}return{files:o,depth:t,path:e}}async _formatEntry(e,t){let o;try{let s=this._isDirent?e.name:e,r=ft.resolve(ft.join(t,s));o={path:ft.relative(this._root,r),fullPath:r,basename:s},o[this._statsProp]=this._isDirent?e:await this._stat(r)}catch(s){this._onError(s)}return o}_onError(e){ia(e)&&!this.destroyed?this.emit("warn",e):this.destroy(e)}async _getEntryType(e){let t=e&&e[this._statsProp];if(t){if(t.isFile())return"file";if(t.isDirectory())return"directory";if(t&&t.isSymbolicLink()){let o=e.fullPath;try{let s=await na(o),r=await yo(s);if(r.isFile())return"file";if(r.isDirectory()){let i=s.length;if(o.startsWith(s)&&o.substr(i,1)===ft.sep){let a=new Error(`Circular symlink detected: "${o}" points to "${s}"`);return a.code=xo,this._onError(a)}return"directory"}}catch(s){this._onError(s)}}}}_includeAsFile(e){let t=e&&e[this._statsProp];return t&&this._wantsEverything&&!t.isDirectory()}},Ke=(n,e={})=>{let t=e.entryType||e.type;if(t==="both"&&(t=jt),t&&(e.type=t),n){if(typeof n!="string")throw new TypeError("readdirp: root argument must be a string. Usage: readdirp(root, options)");if(t&&!bo.includes(t))throw new Error(`readdirp: Invalid type passed. Use one of ${bo.join(", ")}`)}else throw new Error("readdirp: root argument is required. Usage: readdirp(root, options)");return e.root=n,new Wt(e)},la=(n,e={})=>new Promise((t,o)=>{let s=[];Ke(n,e).on("data",r=>s.push(r)).on("end",()=>t(s)).on("error",r=>o(r))});Ke.promise=la;Ke.ReaddirpStream=Wt;Ke.default=Ke;Po.exports=Ke});var Os=H((Ql,Ro)=>{Ro.exports=function(n,e){if(typeof n!="string")throw new TypeError("expected path to be a string");if(n==="\\"||n==="/")return"/";var t=n.length;if(t<=1)return n;var o="";if(t>4&&n[3]==="\\"){var s=n[2];(s==="?"||s===".")&&n.slice(0,2)==="\\\\"&&(n=n.slice(2),o="//")}var r=n.split(/[/\\]+/);return e!==!1&&r[r.length-1]===""&&r.pop(),o+r.join("/")}});var $o=H((Ao,Mo)=>{"use strict";Object.defineProperty(Ao,"__esModule",{value:!0});var Io=Bs(),da=Os(),Eo="!",pa={returnIndex:!1},ua=n=>Array.isArray(n)?n:[n],ha=(n,e)=>{if(typeof n=="function")return n;if(typeof n=="string"){let t=Io(n,e);return o=>n===o||t(o)}return n instanceof RegExp?t=>n.test(t):t=>!1},To=(n,e,t,o)=>{let s=Array.isArray(t),r=s?t[0]:t;if(!s&&typeof r!="string")throw new TypeError("anymatch: second argument must be a string: got "+Object.prototype.toString.call(r));let i=da(r,!1);for(let c=0;c<e.length;c++){let l=e[c];if(l(i))return o?-1:!1}let a=s&&[i].concat(t.slice(1));for(let c=0;c<n.length;c++){let l=n[c];if(s?l(...a):l(i))return o?c:!0}return o?-1:!1},js=(n,e,t=pa)=>{if(n==null)throw new TypeError("anymatch: specify first argument");let o=typeof t=="boolean"?{returnIndex:t}:t,s=o.returnIndex||!1,r=ua(n),i=r.filter(c=>typeof c=="string"&&c.charAt(0)===Eo).map(c=>c.slice(1)).map(c=>Io(c,o)),a=r.filter(c=>typeof c!="string"||typeof c=="string"&&c.charAt(0)!==Eo).map(c=>ha(c,o));return e==null?(c,l=!1)=>To(a,i,c,typeof l=="boolean"?l:!1):To(a,i,e,s)};js.default=js;Mo.exports=js});var Fo=H((Xl,Do)=>{Do.exports=function(e){if(typeof e!="string"||e==="")return!1;for(var t;t=/(\\).|([@?!+*]\(.*\))/g.exec(e);){if(t[2])return!0;e=e.slice(t.index+t[0].length)}return!1}});var Ws=H((Jl,Bo)=>{var fa=Fo(),Lo={"{":"}","(":")","[":"]"},ga=function(n){if(n[0]==="!")return!0;for(var e=0,t=-2,o=-2,s=-2,r=-2,i=-2;e<n.length;){if(n[e]==="*"||n[e+1]==="?"&&/[\].+)]/.test(n[e])||o!==-1&&n[e]==="["&&n[e+1]!=="]"&&(o<e&&(o=n.indexOf("]",e)),o>e&&(i===-1||i>o||(i=n.indexOf("\\",e),i===-1||i>o)))||s!==-1&&n[e]==="{"&&n[e+1]!=="}"&&(s=n.indexOf("}",e),s>e&&(i=n.indexOf("\\",e),i===-1||i>s))||r!==-1&&n[e]==="("&&n[e+1]==="?"&&/[:!=]/.test(n[e+2])&&n[e+3]!==")"&&(r=n.indexOf(")",e),r>e&&(i=n.indexOf("\\",e),i===-1||i>r))||t!==-1&&n[e]==="("&&n[e+1]!=="|"&&(t<e&&(t=n.indexOf("|",e)),t!==-1&&n[t+1]!==")"&&(r=n.indexOf(")",t),r>t&&(i=n.indexOf("\\",t),i===-1||i>r))))return!0;if(n[e]==="\\"){var a=n[e+1];e+=2;var c=Lo[a];if(c){var l=n.indexOf(c,e);l!==-1&&(e=l+1)}if(n[e]==="!")return!0}else e++}return!1},ma=function(n){if(n[0]==="!")return!0;for(var e=0;e<n.length;){if(/[*?{}()[\]]/.test(n[e]))return!0;if(n[e]==="\\"){var t=n[e+1];e+=2;var o=Lo[t];if(o){var s=n.indexOf(o,e);s!==-1&&(e=s+1)}if(n[e]==="!")return!0}else e++}return!1};Bo.exports=function(e,t){if(typeof e!="string"||e==="")return!1;if(fa(e))return!0;var o=ga;return t&&t.strict===!1&&(o=ma),o(e)}});var No=H((Zl,Ho)=>{"use strict";var wa=Ws(),va=require("path").posix.dirname,ya=require("os").platform()==="win32",qs="/",ba=/\\/g,_a=/[\{\[].*[\}\]]$/,ka=/(^|[^\\])([\{\[]|\([^\)]+$)/,xa=/\\([\!\*\?\|\[\]\(\)\{\}])/g;Ho.exports=function(e,t){var o=Object.assign({flipBackslashes:!0},t);o.flipBackslashes&&ya&&e.indexOf(qs)<0&&(e=e.replace(ba,qs)),_a.test(e)&&(e+=qs),e+="a";do e=va(e);while(wa(e)||ka.test(e));return e.replace(xa,"$1")}});var Ut=H(ge=>{"use strict";ge.isInteger=n=>typeof n=="number"?Number.isInteger(n):typeof n=="string"&&n.trim()!==""?Number.isInteger(Number(n)):!1;ge.find=(n,e)=>n.nodes.find(t=>t.type===e);ge.exceedsLimit=(n,e,t=1,o)=>o===!1||!ge.isInteger(n)||!ge.isInteger(e)?!1:(Number(e)-Number(n))/Number(t)>=o;ge.escapeNode=(n,e=0,t)=>{let o=n.nodes[e];o&&(t&&o.type===t||o.type==="open"||o.type==="close")&&o.escaped!==!0&&(o.value="\\"+o.value,o.escaped=!0)};ge.encloseBrace=n=>n.type!=="brace"?!1:n.commas>>0+n.ranges>>0===0?(n.invalid=!0,!0):!1;ge.isInvalidBrace=n=>n.type!=="brace"?!1:n.invalid===!0||n.dollar?!0:n.commas>>0+n.ranges>>0===0||n.open!==!0||n.close!==!0?(n.invalid=!0,!0):!1;ge.isOpenOrClose=n=>n.type==="open"||n.type==="close"?!0:n.open===!0||n.close===!0;ge.reduce=n=>n.reduce((e,t)=>(t.type==="text"&&e.push(t.value),t.type==="range"&&(t.type="text"),e),[]);ge.flatten=(...n)=>{let e=[],t=o=>{for(let s=0;s<o.length;s++){let r=o[s];if(Array.isArray(r)){t(r);continue}r!==void 0&&e.push(r)}return e};return t(n),e}});var Gt=H((td,jo)=>{"use strict";var Oo=Ut();jo.exports=(n,e={})=>{let t=(o,s={})=>{let r=e.escapeInvalid&&Oo.isInvalidBrace(s),i=o.invalid===!0&&e.escapeInvalid===!0,a="";if(o.value)return(r||i)&&Oo.isOpenOrClose(o)?"\\"+o.value:o.value;if(o.value)return o.value;if(o.nodes)for(let c of o.nodes)a+=t(c);return a};return t(n)}});var qo=H((sd,Wo)=>{"use strict";Wo.exports=function(n){return typeof n=="number"?n-n===0:typeof n=="string"&&n.trim()!==""?Number.isFinite?Number.isFinite(+n):isFinite(+n):!1}});var Jo=H((nd,Xo)=>{"use strict";var Uo=qo(),Ne=(n,e,t)=>{if(Uo(n)===!1)throw new TypeError("toRegexRange: expected the first argument to be a number");if(e===void 0||n===e)return String(n);if(Uo(e)===!1)throw new TypeError("toRegexRange: expected the second argument to be a number.");let o={relaxZeros:!0,...t};typeof o.strictZeros=="boolean"&&(o.relaxZeros=o.strictZeros===!1);let s=String(o.relaxZeros),r=String(o.shorthand),i=String(o.capture),a=String(o.wrap),c=n+":"+e+"="+s+r+i+a;if(Ne.cache.hasOwnProperty(c))return Ne.cache[c].result;let l=Math.min(n,e),u=Math.max(n,e);if(Math.abs(l-u)===1){let v=n+"|"+e;return o.capture?`(${v})`:o.wrap===!1?v:`(?:${v})`}let d=Qo(n)||Qo(e),p={min:n,max:e,a:l,b:u},h=[],w=[];if(d&&(p.isPadded=d,p.maxLen=String(p.max).length),l<0){let v=u<0?Math.abs(u):1;w=Go(v,Math.abs(l),p,o),l=p.a=0}return u>=0&&(h=Go(l,u,p,o)),p.negatives=w,p.positives=h,p.result=Ca(w,h,o),o.capture===!0?p.result=`(${p.result})`:o.wrap!==!1&&h.length+w.length>1&&(p.result=`(?:${p.result})`),Ne.cache[c]=p,p.result};function Ca(n,e,t){let o=Us(n,e,"-",!1,t)||[],s=Us(e,n,"",!1,t)||[],r=Us(n,e,"-?",!0,t)||[];return o.concat(r).concat(s).join("|")}function Pa(n,e){let t=1,o=1,s=zo(n,t),r=new Set([e]);for(;n<=s&&s<=e;)r.add(s),t+=1,s=zo(n,t);for(s=Ko(e+1,o)-1;n<s&&s<=e;)r.add(s),o+=1,s=Ko(e+1,o)-1;return r=[...r],r.sort(Ea),r}function Sa(n,e,t){if(n===e)return{pattern:n,count:[],digits:0};let o=Ra(n,e),s=o.length,r="",i=0;for(let a=0;a<s;a++){let[c,l]=o[a];c===l?r+=c:c!=="0"||l!=="9"?r+=Ta(c,l,t):i++}return i&&(r+=t.shorthand===!0?"\\d":"[0-9]"),{pattern:r,count:[i],digits:s}}function Go(n,e,t,o){let s=Pa(n,e),r=[],i=n,a;for(let c=0;c<s.length;c++){let l=s[c],u=Sa(String(i),String(l),o),d="";if(!t.isPadded&&a&&a.pattern===u.pattern){a.count.length>1&&a.count.pop(),a.count.push(u.count[0]),a.string=a.pattern+Yo(a.count),i=l+1;continue}t.isPadded&&(d=Ia(l,t,o)),u.string=d+u.pattern+Yo(u.count),r.push(u),i=l+1,a=u}return r}function Us(n,e,t,o,s){let r=[];for(let i of n){let{string:a}=i;!o&&!Vo(e,"string",a)&&r.push(t+a),o&&Vo(e,"string",a)&&r.push(t+a)}return r}function Ra(n,e){let t=[];for(let o=0;o<n.length;o++)t.push([n[o],e[o]]);return t}function Ea(n,e){return n>e?1:e>n?-1:0}function Vo(n,e,t){return n.some(o=>o[e]===t)}function zo(n,e){return Number(String(n).slice(0,-e)+"9".repeat(e))}function Ko(n,e){return n-n%Math.pow(10,e)}function Yo(n){let[e=0,t=""]=n;return t||e>1?`{${e+(t?","+t:"")}}`:""}function Ta(n,e,t){return`[${n}${e-n===1?"":"-"}${e}]`}function Qo(n){return/^-?(0+)\d/.test(n)}function Ia(n,e,t){if(!e.isPadded)return n;let o=Math.abs(e.maxLen-String(n).length),s=t.relaxZeros!==!1;switch(o){case 0:return"";case 1:return s?"0?":"0";case 2:return s?"0{0,2}":"00";default:return s?`0{0,${o}}`:`0{${o}}`}}Ne.cache={};Ne.clearCache=()=>Ne.cache={};Xo.exports=Ne});var zs=H((od,rr)=>{"use strict";var Aa=require("util"),er=Jo(),Zo=n=>n!==null&&typeof n=="object"&&!Array.isArray(n),Ma=n=>e=>n===!0?Number(e):String(e),Gs=n=>typeof n=="number"||typeof n=="string"&&n!=="",mt=n=>Number.isInteger(+n),Vs=n=>{let e=`${n}`,t=-1;if(e[0]==="-"&&(e=e.slice(1)),e==="0")return!1;for(;e[++t]==="0";);return t>0},$a=(n,e,t)=>typeof n=="string"||typeof e=="string"?!0:t.stringify===!0,Da=(n,e,t)=>{if(e>0){let o=n[0]==="-"?"-":"";o&&(n=n.slice(1)),n=o+n.padStart(o?e-1:e,"0")}return t===!1?String(n):n},zt=(n,e)=>{let t=n[0]==="-"?"-":"";for(t&&(n=n.slice(1),e--);n.length<e;)n="0"+n;return t?"-"+n:n},Fa=(n,e,t)=>{n.negatives.sort((a,c)=>a<c?-1:a>c?1:0),n.positives.sort((a,c)=>a<c?-1:a>c?1:0);let o=e.capture?"":"?:",s="",r="",i;return n.positives.length&&(s=n.positives.map(a=>zt(String(a),t)).join("|")),n.negatives.length&&(r=`-(${o}${n.negatives.map(a=>zt(String(a),t)).join("|")})`),s&&r?i=`${s}|${r}`:i=s||r,e.wrap?`(${o}${i})`:i},tr=(n,e,t,o)=>{if(t)return er(n,e,{wrap:!1,...o});let s=String.fromCharCode(n);if(n===e)return s;let r=String.fromCharCode(e);return`[${s}-${r}]`},sr=(n,e,t)=>{if(Array.isArray(n)){let o=t.wrap===!0,s=t.capture?"":"?:";return o?`(${s}${n.join("|")})`:n.join("|")}return er(n,e,t)},nr=(...n)=>new RangeError("Invalid range arguments: "+Aa.inspect(...n)),or=(n,e,t)=>{if(t.strictRanges===!0)throw nr([n,e]);return[]},La=(n,e)=>{if(e.strictRanges===!0)throw new TypeError(`Expected step "${n}" to be a number`);return[]},Ba=(n,e,t=1,o={})=>{let s=Number(n),r=Number(e);if(!Number.isInteger(s)||!Number.isInteger(r)){if(o.strictRanges===!0)throw nr([n,e]);return[]}s===0&&(s=0),r===0&&(r=0);let i=s>r,a=String(n),c=String(e),l=String(t);t=Math.max(Math.abs(t),1);let u=Vs(a)||Vs(c)||Vs(l),d=u?Math.max(a.length,c.length,l.length):0,p=u===!1&&$a(n,e,o)===!1,h=o.transform||Ma(p);if(o.toRegex&&t===1)return tr(zt(n,d),zt(e,d),!0,o);let w={negatives:[],positives:[]},v=x=>w[x<0?"negatives":"positives"].push(Math.abs(x)),_=[],D=0;for(;i?s>=r:s<=r;)o.toRegex===!0&&t>1?v(s):_.push(Da(h(s,D),d,p)),s=i?s-t:s+t,D++;return o.toRegex===!0?t>1?Fa(w,o,d):sr(_,null,{wrap:!1,...o}):_},Ha=(n,e,t=1,o={})=>{if(!mt(n)&&n.length>1||!mt(e)&&e.length>1)return or(n,e,o);let s=o.transform||(p=>String.fromCharCode(p)),r=`${n}`.charCodeAt(0),i=`${e}`.charCodeAt(0),a=r>i,c=Math.min(r,i),l=Math.max(r,i);if(o.toRegex&&t===1)return tr(c,l,!1,o);let u=[],d=0;for(;a?r>=i:r<=i;)u.push(s(r,d)),r=a?r-t:r+t,d++;return o.toRegex===!0?sr(u,null,{wrap:!1,options:o}):u},Vt=(n,e,t,o={})=>{if(e==null&&Gs(n))return[n];if(!Gs(n)||!Gs(e))return or(n,e,o);if(typeof t=="function")return Vt(n,e,1,{transform:t});if(Zo(t))return Vt(n,e,0,t);let s={...o};return s.capture===!0&&(s.wrap=!0),t=t||s.step||1,mt(t)?mt(n)&&mt(e)?Ba(n,e,t,s):Ha(n,e,Math.max(Math.abs(t),1),s):t!=null&&!Zo(t)?La(t,s):Vt(n,e,1,t)};rr.exports=Vt});var cr=H((rd,ar)=>{"use strict";var Na=zs(),ir=Ut(),Oa=(n,e={})=>{let t=(o,s={})=>{let r=ir.isInvalidBrace(s),i=o.invalid===!0&&e.escapeInvalid===!0,a=r===!0||i===!0,c=e.escapeInvalid===!0?"\\":"",l="";if(o.isOpen===!0)return c+o.value;if(o.isClose===!0)return console.log("node.isClose",c,o.value),c+o.value;if(o.type==="open")return a?c+o.value:"(";if(o.type==="close")return a?c+o.value:")";if(o.type==="comma")return o.prev.type==="comma"?"":a?o.value:"|";if(o.value)return o.value;if(o.nodes&&o.ranges>0){let u=ir.reduce(o.nodes),d=Na(...u,{...e,wrap:!1,toRegex:!0,strictZeros:!0});if(d.length!==0)return u.length>1&&d.length>1?`(${d})`:d}if(o.nodes)for(let u of o.nodes)l+=t(u,o);return l};return t(n)};ar.exports=Oa});var pr=H((id,dr)=>{"use strict";var ja=zs(),lr=Gt(),Ye=Ut(),Oe=(n="",e="",t=!1)=>{let o=[];if(n=[].concat(n),e=[].concat(e),!e.length)return n;if(!n.length)return t?Ye.flatten(e).map(s=>`{${s}}`):e;for(let s of n)if(Array.isArray(s))for(let r of s)o.push(Oe(r,e,t));else for(let r of e)t===!0&&typeof r=="string"&&(r=`{${r}}`),o.push(Array.isArray(r)?Oe(s,r,t):s+r);return Ye.flatten(o)},Wa=(n,e={})=>{let t=e.rangeLimit===void 0?1e3:e.rangeLimit,o=(s,r={})=>{s.queue=[];let i=r,a=r.queue;for(;i.type!=="brace"&&i.type!=="root"&&i.parent;)i=i.parent,a=i.queue;if(s.invalid||s.dollar){a.push(Oe(a.pop(),lr(s,e)));return}if(s.type==="brace"&&s.invalid!==!0&&s.nodes.length===2){a.push(Oe(a.pop(),["{}"]));return}if(s.nodes&&s.ranges>0){let d=Ye.reduce(s.nodes);if(Ye.exceedsLimit(...d,e.step,t))throw new RangeError("expanded array length exceeds range limit. Use options.rangeLimit to increase or disable the limit.");let p=ja(...d,e);p.length===0&&(p=lr(s,e)),a.push(Oe(a.pop(),p)),s.nodes=[];return}let c=Ye.encloseBrace(s),l=s.queue,u=s;for(;u.type!=="brace"&&u.type!=="root"&&u.parent;)u=u.parent,l=u.queue;for(let d=0;d<s.nodes.length;d++){let p=s.nodes[d];if(p.type==="comma"&&s.type==="brace"){d===1&&l.push(""),l.push("");continue}if(p.type==="close"){a.push(Oe(a.pop(),l,c));continue}if(p.value&&p.type!=="open"){l.push(Oe(l.pop(),p.value));continue}p.nodes&&o(p,s)}return l};return Ye.flatten(o(n))};dr.exports=Wa});var hr=H((ad,ur)=>{"use strict";ur.exports={MAX_LENGTH:1e4,CHAR_0:"0",CHAR_9:"9",CHAR_UPPERCASE_A:"A",CHAR_LOWERCASE_A:"a",CHAR_UPPERCASE_Z:"Z",CHAR_LOWERCASE_Z:"z",CHAR_LEFT_PARENTHESES:"(",CHAR_RIGHT_PARENTHESES:")",CHAR_ASTERISK:"*",CHAR_AMPERSAND:"&",CHAR_AT:"@",CHAR_BACKSLASH:"\\",CHAR_BACKTICK:"`",CHAR_CARRIAGE_RETURN:"\r",CHAR_CIRCUMFLEX_ACCENT:"^",CHAR_COLON:":",CHAR_COMMA:",",CHAR_DOLLAR:"$",CHAR_DOT:".",CHAR_DOUBLE_QUOTE:'"',CHAR_EQUAL:"=",CHAR_EXCLAMATION_MARK:"!",CHAR_FORM_FEED:"\f",CHAR_FORWARD_SLASH:"/",CHAR_HASH:"#",CHAR_HYPHEN_MINUS:"-",CHAR_LEFT_ANGLE_BRACKET:"<",CHAR_LEFT_CURLY_BRACE:"{",CHAR_LEFT_SQUARE_BRACKET:"[",CHAR_LINE_FEED:`
`,CHAR_NO_BREAK_SPACE:"\xA0",CHAR_PERCENT:"%",CHAR_PLUS:"+",CHAR_QUESTION_MARK:"?",CHAR_RIGHT_ANGLE_BRACKET:">",CHAR_RIGHT_CURLY_BRACE:"}",CHAR_RIGHT_SQUARE_BRACKET:"]",CHAR_SEMICOLON:";",CHAR_SINGLE_QUOTE:"'",CHAR_SPACE:" ",CHAR_TAB:"	",CHAR_UNDERSCORE:"_",CHAR_VERTICAL_LINE:"|",CHAR_ZERO_WIDTH_NOBREAK_SPACE:"\uFEFF"}});var vr=H((cd,wr)=>{"use strict";var qa=Gt(),{MAX_LENGTH:fr,CHAR_BACKSLASH:Ks,CHAR_BACKTICK:Ua,CHAR_COMMA:Ga,CHAR_DOT:Va,CHAR_LEFT_PARENTHESES:za,CHAR_RIGHT_PARENTHESES:Ka,CHAR_LEFT_CURLY_BRACE:Ya,CHAR_RIGHT_CURLY_BRACE:Qa,CHAR_LEFT_SQUARE_BRACKET:gr,CHAR_RIGHT_SQUARE_BRACKET:mr,CHAR_DOUBLE_QUOTE:Xa,CHAR_SINGLE_QUOTE:Ja,CHAR_NO_BREAK_SPACE:Za,CHAR_ZERO_WIDTH_NOBREAK_SPACE:ec}=hr(),tc=(n,e={})=>{if(typeof n!="string")throw new TypeError("Expected a string");let t=e||{},o=typeof t.maxLength=="number"?Math.min(fr,t.maxLength):fr;if(n.length>o)throw new SyntaxError(`Input length (${n.length}), exceeds max characters (${o})`);let s={type:"root",input:n,nodes:[]},r=[s],i=s,a=s,c=0,l=n.length,u=0,d=0,p,h=()=>n[u++],w=v=>{if(v.type==="text"&&a.type==="dot"&&(a.type="text"),a&&a.type==="text"&&v.type==="text"){a.value+=v.value;return}return i.nodes.push(v),v.parent=i,v.prev=a,a=v,v};for(w({type:"bos"});u<l;)if(i=r[r.length-1],p=h(),!(p===ec||p===Za)){if(p===Ks){w({type:"text",value:(e.keepEscaping?p:"")+h()});continue}if(p===mr){w({type:"text",value:"\\"+p});continue}if(p===gr){c++;let v;for(;u<l&&(v=h());){if(p+=v,v===gr){c++;continue}if(v===Ks){p+=h();continue}if(v===mr&&(c--,c===0))break}w({type:"text",value:p});continue}if(p===za){i=w({type:"paren",nodes:[]}),r.push(i),w({type:"text",value:p});continue}if(p===Ka){if(i.type!=="paren"){w({type:"text",value:p});continue}i=r.pop(),w({type:"text",value:p}),i=r[r.length-1];continue}if(p===Xa||p===Ja||p===Ua){let v=p,_;for(e.keepQuotes!==!0&&(p="");u<l&&(_=h());){if(_===Ks){p+=_+h();continue}if(_===v){e.keepQuotes===!0&&(p+=_);break}p+=_}w({type:"text",value:p});continue}if(p===Ya){d++;let _={type:"brace",open:!0,close:!1,dollar:a.value&&a.value.slice(-1)==="$"||i.dollar===!0,depth:d,commas:0,ranges:0,nodes:[]};i=w(_),r.push(i),w({type:"open",value:p});continue}if(p===Qa){if(i.type!=="brace"){w({type:"text",value:p});continue}let v="close";i=r.pop(),i.close=!0,w({type:v,value:p}),d--,i=r[r.length-1];continue}if(p===Ga&&d>0){if(i.ranges>0){i.ranges=0;let v=i.nodes.shift();i.nodes=[v,{type:"text",value:qa(i)}]}w({type:"comma",value:p}),i.commas++;continue}if(p===Va&&d>0&&i.commas===0){let v=i.nodes;if(d===0||v.length===0){w({type:"text",value:p});continue}if(a.type==="dot"){if(i.range=[],a.value+=p,a.type="range",i.nodes.length!==3&&i.nodes.length!==5){i.invalid=!0,i.ranges=0,a.type="text";continue}i.ranges++,i.args=[];continue}if(a.type==="range"){v.pop();let _=v[v.length-1];_.value+=a.value+p,a=_,i.ranges--;continue}w({type:"dot",value:p});continue}w({type:"text",value:p})}do if(i=r.pop(),i.type!=="root"){i.nodes.forEach(D=>{D.nodes||(D.type==="open"&&(D.isOpen=!0),D.type==="close"&&(D.isClose=!0),D.nodes||(D.type="text"),D.invalid=!0)});let v=r[r.length-1],_=v.nodes.indexOf(i);v.nodes.splice(_,1,...i.nodes)}while(r.length>0);return w({type:"eos"}),s};wr.exports=tc});var _r=H((ld,br)=>{"use strict";var yr=Gt(),sc=cr(),nc=pr(),oc=vr(),ue=(n,e={})=>{let t=[];if(Array.isArray(n))for(let o of n){let s=ue.create(o,e);Array.isArray(s)?t.push(...s):t.push(s)}else t=[].concat(ue.create(n,e));return e&&e.expand===!0&&e.nodupes===!0&&(t=[...new Set(t)]),t};ue.parse=(n,e={})=>oc(n,e);ue.stringify=(n,e={})=>yr(typeof n=="string"?ue.parse(n,e):n,e);ue.compile=(n,e={})=>(typeof n=="string"&&(n=ue.parse(n,e)),sc(n,e));ue.expand=(n,e={})=>{typeof n=="string"&&(n=ue.parse(n,e));let t=nc(n,e);return e.noempty===!0&&(t=t.filter(Boolean)),e.nodupes===!0&&(t=[...new Set(t)]),t};ue.create=(n,e={})=>n===""||n.length<3?[n]:e.expand!==!0?ue.compile(n,e):ue.expand(n,e);br.exports=ue});var kr=H((dd,rc)=>{rc.exports=["3dm","3ds","3g2","3gp","7z","a","aac","adp","afdesign","afphoto","afpub","ai","aif","aiff","alz","ape","apk","appimage","ar","arj","asf","au","avi","bak","baml","bh","bin","bk","bmp","btif","bz2","bzip2","cab","caf","cgm","class","cmx","cpio","cr2","cur","dat","dcm","deb","dex","djvu","dll","dmg","dng","doc","docm","docx","dot","dotm","dra","DS_Store","dsk","dts","dtshd","dvb","dwg","dxf","ecelp4800","ecelp7470","ecelp9600","egg","eol","eot","epub","exe","f4v","fbs","fh","fla","flac","flatpak","fli","flv","fpx","fst","fvt","g3","gh","gif","graffle","gz","gzip","h261","h263","h264","icns","ico","ief","img","ipa","iso","jar","jpeg","jpg","jpgv","jpm","jxr","key","ktx","lha","lib","lvp","lz","lzh","lzma","lzo","m3u","m4a","m4v","mar","mdi","mht","mid","midi","mj2","mka","mkv","mmr","mng","mobi","mov","movie","mp3","mp4","mp4a","mpeg","mpg","mpga","mxu","nef","npx","numbers","nupkg","o","odp","ods","odt","oga","ogg","ogv","otf","ott","pages","pbm","pcx","pdb","pdf","pea","pgm","pic","png","pnm","pot","potm","potx","ppa","ppam","ppm","pps","ppsm","ppsx","ppt","pptm","pptx","psd","pya","pyc","pyo","pyv","qt","rar","ras","raw","resources","rgb","rip","rlc","rmf","rmvb","rpm","rtf","rz","s3m","s7z","scpt","sgi","shar","snap","sil","sketch","slk","smv","snk","so","stl","suo","sub","swf","tar","tbz","tbz2","tga","tgz","thmx","tif","tiff","tlz","ttc","ttf","txz","udf","uvh","uvi","uvm","uvp","uvs","uvu","viv","vob","war","wav","wax","wbmp","wdp","weba","webm","webp","whl","wim","wm","wma","wmv","wmx","woff","woff2","wrm","wvx","xbm","xif","xla","xlam","xls","xlsb","xlsm","xlsx","xlt","xltm","xltx","xm","xmind","xpi","xpm","xwd","xz","z","zip","zipx"]});var Cr=H((pd,xr)=>{xr.exports=kr()});var Sr=H((ud,Pr)=>{"use strict";var ic=require("path"),ac=Cr(),cc=new Set(ac);Pr.exports=n=>cc.has(ic.extname(n).slice(1).toLowerCase())});var Kt=H(k=>{"use strict";var{sep:lc}=require("path"),{platform:Ys}=process,dc=require("os");k.EV_ALL="all";k.EV_READY="ready";k.EV_ADD="add";k.EV_CHANGE="change";k.EV_ADD_DIR="addDir";k.EV_UNLINK="unlink";k.EV_UNLINK_DIR="unlinkDir";k.EV_RAW="raw";k.EV_ERROR="error";k.STR_DATA="data";k.STR_END="end";k.STR_CLOSE="close";k.FSEVENT_CREATED="created";k.FSEVENT_MODIFIED="modified";k.FSEVENT_DELETED="deleted";k.FSEVENT_MOVED="moved";k.FSEVENT_CLONED="cloned";k.FSEVENT_UNKNOWN="unknown";k.FSEVENT_FLAG_MUST_SCAN_SUBDIRS=1;k.FSEVENT_TYPE_FILE="file";k.FSEVENT_TYPE_DIRECTORY="directory";k.FSEVENT_TYPE_SYMLINK="symlink";k.KEY_LISTENERS="listeners";k.KEY_ERR="errHandlers";k.KEY_RAW="rawEmitters";k.HANDLER_KEYS=[k.KEY_LISTENERS,k.KEY_ERR,k.KEY_RAW];k.DOT_SLASH=`.${lc}`;k.BACK_SLASH_RE=/\\/g;k.DOUBLE_SLASH_RE=/\/\//;k.SLASH_OR_BACK_SLASH_RE=/[/\\]/;k.DOT_RE=/\..*\.(sw[px])$|~$|\.subl.*\.tmp/;k.REPLACER_RE=/^\.[/\\]/;k.SLASH="/";k.SLASH_SLASH="//";k.BRACE_START="{";k.BANG="!";k.ONE_DOT=".";k.TWO_DOTS="..";k.STAR="*";k.GLOBSTAR="**";k.ROOT_GLOBSTAR="/**/*";k.SLASH_GLOBSTAR="/**";k.DIR_SUFFIX="Dir";k.ANYMATCH_OPTS={dot:!0};k.STRING_TYPE="string";k.FUNCTION_TYPE="function";k.EMPTY_STR="";k.EMPTY_FN=()=>{};k.IDENTITY_FN=n=>n;k.isWindows=Ys==="win32";k.isMacos=Ys==="darwin";k.isLinux=Ys==="linux";k.isIBMi=dc.type()==="OS400"});var Mr=H((fd,Ar)=>{"use strict";var Se=require("fs"),Q=require("path"),{promisify:bt}=require("util"),pc=Sr(),{isWindows:uc,isLinux:hc,EMPTY_FN:fc,EMPTY_STR:gc,KEY_LISTENERS:Qe,KEY_ERR:Qs,KEY_RAW:wt,HANDLER_KEYS:mc,EV_CHANGE:Qt,EV_ADD:Yt,EV_ADD_DIR:wc,EV_ERROR:Er,STR_DATA:vc,STR_END:yc,BRACE_START:bc,STAR:_c}=Kt(),kc="watch",xc=bt(Se.open),Tr=bt(Se.stat),Cc=bt(Se.lstat),Pc=bt(Se.close),Xs=bt(Se.realpath),Sc={lstat:Cc,stat:Tr},Zs=(n,e)=>{n instanceof Set?n.forEach(e):e(n)},vt=(n,e,t)=>{let o=n[e];o instanceof Set||(n[e]=o=new Set([o])),o.add(t)},Rc=n=>e=>{let t=n[e];t instanceof Set?t.clear():delete n[e]},yt=(n,e,t)=>{let o=n[e];o instanceof Set?o.delete(t):o===t&&delete n[e]},Ir=n=>n instanceof Set?n.size===0:!n,Xt=new Map;function Rr(n,e,t,o,s){let r=(i,a)=>{t(n),s(i,a,{watchedPath:n}),a&&n!==a&&Jt(Q.resolve(n,a),Qe,Q.join(n,a))};try{return Se.watch(n,e,r)}catch(i){o(i)}}var Jt=(n,e,t,o,s)=>{let r=Xt.get(n);r&&Zs(r[e],i=>{i(t,o,s)})},Ec=(n,e,t,o)=>{let{listener:s,errHandler:r,rawEmitter:i}=o,a=Xt.get(e),c;if(!t.persistent)return c=Rr(n,t,s,r,i),c.close.bind(c);if(a)vt(a,Qe,s),vt(a,Qs,r),vt(a,wt,i);else{if(c=Rr(n,t,Jt.bind(null,e,Qe),r,Jt.bind(null,e,wt)),!c)return;c.on(Er,async l=>{let u=Jt.bind(null,e,Qs);if(a.watcherUnusable=!0,uc&&l.code==="EPERM")try{let d=await xc(n,"r");await Pc(d),u(l)}catch{}else u(l)}),a={listeners:s,errHandlers:r,rawEmitters:i,watcher:c},Xt.set(e,a)}return()=>{yt(a,Qe,s),yt(a,Qs,r),yt(a,wt,i),Ir(a.listeners)&&(a.watcher.close(),Xt.delete(e),mc.forEach(Rc(a)),a.watcher=void 0,Object.freeze(a))}},Js=new Map,Tc=(n,e,t,o)=>{let{listener:s,rawEmitter:r}=o,i=Js.get(e),a=new Set,c=new Set,l=i&&i.options;return l&&(l.persistent<t.persistent||l.interval>t.interval)&&(a=i.listeners,c=i.rawEmitters,Se.unwatchFile(e),i=void 0),i?(vt(i,Qe,s),vt(i,wt,r)):(i={listeners:s,rawEmitters:r,options:t,watcher:Se.watchFile(e,t,(u,d)=>{Zs(i.rawEmitters,h=>{h(Qt,e,{curr:u,prev:d})});let p=u.mtimeMs;(u.size!==d.size||p>d.mtimeMs||p===0)&&Zs(i.listeners,h=>h(n,u))})},Js.set(e,i)),()=>{yt(i,Qe,s),yt(i,wt,r),Ir(i.listeners)&&(Js.delete(e),Se.unwatchFile(e),i.options=i.watcher=void 0,Object.freeze(i))}},en=class{constructor(e){this.fsw=e,this._boundHandleError=t=>e._handleError(t)}_watchWithNodeFs(e,t){let o=this.fsw.options,s=Q.dirname(e),r=Q.basename(e);this.fsw._getWatchedDir(s).add(r);let a=Q.resolve(e),c={persistent:o.persistent};t||(t=fc);let l;return o.usePolling?(c.interval=o.enableBinaryInterval&&pc(r)?o.binaryInterval:o.interval,l=Tc(e,a,c,{listener:t,rawEmitter:this.fsw._emitRaw})):l=Ec(e,a,c,{listener:t,errHandler:this._boundHandleError,rawEmitter:this.fsw._emitRaw}),l}_handleFile(e,t,o){if(this.fsw.closed)return;let s=Q.dirname(e),r=Q.basename(e),i=this.fsw._getWatchedDir(s),a=t;if(i.has(r))return;let c=async(u,d)=>{if(this.fsw._throttle(kc,e,5)){if(!d||d.mtimeMs===0)try{let p=await Tr(e);if(this.fsw.closed)return;let h=p.atimeMs,w=p.mtimeMs;(!h||h<=w||w!==a.mtimeMs)&&this.fsw._emit(Qt,e,p),hc&&a.ino!==p.ino?(this.fsw._closeFile(u),a=p,this.fsw._addPathCloser(u,this._watchWithNodeFs(e,c))):a=p}catch{this.fsw._remove(s,r)}else if(i.has(r)){let p=d.atimeMs,h=d.mtimeMs;(!p||p<=h||h!==a.mtimeMs)&&this.fsw._emit(Qt,e,d),a=d}}},l=this._watchWithNodeFs(e,c);if(!(o&&this.fsw.options.ignoreInitial)&&this.fsw._isntIgnored(e)){if(!this.fsw._throttle(Yt,e,0))return;this.fsw._emit(Yt,e,t)}return l}async _handleSymlink(e,t,o,s){if(this.fsw.closed)return;let r=e.fullPath,i=this.fsw._getWatchedDir(t);if(!this.fsw.options.followSymlinks){this.fsw._incrReadyCount();let a;try{a=await Xs(o)}catch{return this.fsw._emitReady(),!0}return this.fsw.closed?void 0:(i.has(s)?this.fsw._symlinkPaths.get(r)!==a&&(this.fsw._symlinkPaths.set(r,a),this.fsw._emit(Qt,o,e.stats)):(i.add(s),this.fsw._symlinkPaths.set(r,a),this.fsw._emit(Yt,o,e.stats)),this.fsw._emitReady(),!0)}if(this.fsw._symlinkPaths.has(r))return!0;this.fsw._symlinkPaths.set(r,!0)}_handleRead(e,t,o,s,r,i,a){if(e=Q.join(e,gc),!o.hasGlob&&(a=this.fsw._throttle("readdir",e,1e3),!a))return;let c=this.fsw._getWatchedDir(o.path),l=new Set,u=this.fsw._readdirp(e,{fileFilter:d=>o.filterPath(d),directoryFilter:d=>o.filterDir(d),depth:0}).on(vc,async d=>{if(this.fsw.closed){u=void 0;return}let p=d.path,h=Q.join(e,p);if(l.add(p),!(d.stats.isSymbolicLink()&&await this._handleSymlink(d,e,h,p))){if(this.fsw.closed){u=void 0;return}(p===s||!s&&!c.has(p))&&(this.fsw._incrReadyCount(),h=Q.join(r,Q.relative(r,h)),this._addToNodeFs(h,t,o,i+1))}}).on(Er,this._boundHandleError);return new Promise(d=>u.once(yc,()=>{if(this.fsw.closed){u=void 0;return}let p=a?a.clear():!1;d(),c.getChildren().filter(h=>h!==e&&!l.has(h)&&(!o.hasGlob||o.filterPath({fullPath:Q.resolve(e,h)}))).forEach(h=>{this.fsw._remove(e,h)}),u=void 0,p&&this._handleRead(e,!1,o,s,r,i,a)}))}async _handleDir(e,t,o,s,r,i,a){let c=this.fsw._getWatchedDir(Q.dirname(e)),l=c.has(Q.basename(e));!(o&&this.fsw.options.ignoreInitial)&&!r&&!l&&(!i.hasGlob||i.globFilter(e))&&this.fsw._emit(wc,e,t),c.add(Q.basename(e)),this.fsw._getWatchedDir(e);let u,d,p=this.fsw.options.depth;if((p==null||s<=p)&&!this.fsw._symlinkPaths.has(a)){if(!r&&(await this._handleRead(e,o,i,r,e,s,u),this.fsw.closed))return;d=this._watchWithNodeFs(e,(h,w)=>{w&&w.mtimeMs===0||this._handleRead(h,!1,i,r,e,s,u)})}return d}async _addToNodeFs(e,t,o,s,r){let i=this.fsw._emitReady;if(this.fsw._isIgnored(e)||this.fsw.closed)return i(),!1;let a=this.fsw._getWatchHelpers(e,s);!a.hasGlob&&o&&(a.hasGlob=o.hasGlob,a.globFilter=o.globFilter,a.filterPath=c=>o.filterPath(c),a.filterDir=c=>o.filterDir(c));try{let c=await Sc[a.statMethod](a.watchPath);if(this.fsw.closed)return;if(this.fsw._isIgnored(a.watchPath,c))return i(),!1;let l=this.fsw.options.followSymlinks&&!e.includes(_c)&&!e.includes(bc),u;if(c.isDirectory()){let d=Q.resolve(e),p=l?await Xs(e):e;if(this.fsw.closed||(u=await this._handleDir(a.watchPath,c,t,s,r,a,p),this.fsw.closed))return;d!==p&&p!==void 0&&this.fsw._symlinkPaths.set(d,p)}else if(c.isSymbolicLink()){let d=l?await Xs(e):e;if(this.fsw.closed)return;let p=Q.dirname(a.watchPath);if(this.fsw._getWatchedDir(p).add(a.watchPath),this.fsw._emit(Yt,a.watchPath,c),u=await this._handleDir(p,c,t,s,e,a,d),this.fsw.closed)return;d!==void 0&&this.fsw._symlinkPaths.set(Q.resolve(e),d)}else u=this._handleFile(a.watchPath,c,t);return i(),this.fsw._addPathCloser(e,u),!1}catch(c){if(this.fsw._handleError(c))return i(),e}}};Ar.exports=en});var Nr=H((gd,ln)=>{"use strict";var an=require("fs"),X=require("path"),{promisify:cn}=require("util"),Xe;try{Xe=require("fsevents")}catch(n){process.env.CHOKIDAR_PRINT_FSEVENTS_REQUIRE_ERROR&&console.error(n)}if(Xe){let n=process.version.match(/v(\d+)\.(\d+)/);if(n&&n[1]&&n[2]){let e=Number.parseInt(n[1],10),t=Number.parseInt(n[2],10);e===8&&t<16&&(Xe=void 0)}}var{EV_ADD:tn,EV_CHANGE:Ic,EV_ADD_DIR:$r,EV_UNLINK:Zt,EV_ERROR:Ac,STR_DATA:Mc,STR_END:$c,FSEVENT_CREATED:Dc,FSEVENT_MODIFIED:Fc,FSEVENT_DELETED:Lc,FSEVENT_MOVED:Bc,FSEVENT_UNKNOWN:Hc,FSEVENT_FLAG_MUST_SCAN_SUBDIRS:Nc,FSEVENT_TYPE_FILE:Oc,FSEVENT_TYPE_DIRECTORY:_t,FSEVENT_TYPE_SYMLINK:Hr,ROOT_GLOBSTAR:Dr,DIR_SUFFIX:jc,DOT_SLASH:Fr,FUNCTION_TYPE:sn,EMPTY_FN:Wc,IDENTITY_FN:qc}=Kt(),Uc=n=>isNaN(n)?{}:{depth:n},on=cn(an.stat),Gc=cn(an.lstat),Lr=cn(an.realpath),Vc={stat:on,lstat:Gc},je=new Map,zc=10,Kc=new Set([69888,70400,71424,72704,73472,131328,131840,262912]),Yc=(n,e)=>({stop:Xe.watch(n,e)});function Qc(n,e,t,o){let s=X.extname(e)?X.dirname(e):e,r=X.dirname(s),i=je.get(s);Xc(r)&&(s=r);let a=X.resolve(n),c=a!==e,l=(d,p,h)=>{c&&(d=d.replace(e,a)),(d===a||!d.indexOf(a+X.sep))&&t(d,p,h)},u=!1;for(let d of je.keys())if(e.indexOf(X.resolve(d)+X.sep)===0){s=d,i=je.get(s),u=!0;break}return i||u?i.listeners.add(l):(i={listeners:new Set([l]),rawEmitter:o,watcher:Yc(s,(d,p)=>{if(!i.listeners.size||p&Nc)return;let h=Xe.getInfo(d,p);i.listeners.forEach(w=>{w(d,p,h)}),i.rawEmitter(h.event,d,h)})},je.set(s,i)),()=>{let d=i.listeners;if(d.delete(l),!d.size&&(je.delete(s),i.watcher))return i.watcher.stop().then(()=>{i.rawEmitter=i.watcher=void 0,Object.freeze(i)})}}var Xc=n=>{let e=0;for(let t of je.keys())if(t.indexOf(n)===0&&(e++,e>=zc))return!0;return!1},Jc=()=>Xe&&je.size<128,nn=(n,e)=>{let t=0;for(;!n.indexOf(e)&&(n=X.dirname(n))!==e;)t++;return t},Br=(n,e)=>n.type===_t&&e.isDirectory()||n.type===Hr&&e.isSymbolicLink()||n.type===Oc&&e.isFile(),rn=class{constructor(e){this.fsw=e}checkIgnored(e,t){let o=this.fsw._ignoredPaths;if(this.fsw._isIgnored(e,t))return o.add(e),t&&t.isDirectory()&&o.add(e+Dr),!0;o.delete(e),o.delete(e+Dr)}addOrChange(e,t,o,s,r,i,a,c){let l=r.has(i)?Ic:tn;this.handleEvent(l,e,t,o,s,r,i,a,c)}async checkExists(e,t,o,s,r,i,a,c){try{let l=await on(e);if(this.fsw.closed)return;Br(a,l)?this.addOrChange(e,t,o,s,r,i,a,c):this.handleEvent(Zt,e,t,o,s,r,i,a,c)}catch(l){l.code==="EACCES"?this.addOrChange(e,t,o,s,r,i,a,c):this.handleEvent(Zt,e,t,o,s,r,i,a,c)}}handleEvent(e,t,o,s,r,i,a,c,l){if(!(this.fsw.closed||this.checkIgnored(t)))if(e===Zt){let u=c.type===_t;(u||i.has(a))&&this.fsw._remove(r,a,u)}else{if(e===tn){if(c.type===_t&&this.fsw._getWatchedDir(t),c.type===Hr&&l.followSymlinks){let d=l.depth===void 0?void 0:nn(o,s)+1;return this._addToFsEvents(t,!1,!0,d)}this.fsw._getWatchedDir(r).add(a)}let u=c.type===_t?e+jc:e;this.fsw._emit(u,t),u===$r&&this._addToFsEvents(t,!1,!0)}}_watchWithFsEvents(e,t,o,s){if(this.fsw.closed||this.fsw._isIgnored(e))return;let r=this.fsw.options,a=Qc(e,t,async(c,l,u)=>{if(this.fsw.closed||r.depth!==void 0&&nn(c,t)>r.depth)return;let d=o(X.join(e,X.relative(e,c)));if(s&&!s(d))return;let p=X.dirname(d),h=X.basename(d),w=this.fsw._getWatchedDir(u.type===_t?d:p);if(Kc.has(l)||u.event===Hc)if(typeof r.ignored===sn){let v;try{v=await on(d)}catch{}if(this.fsw.closed||this.checkIgnored(d,v))return;Br(u,v)?this.addOrChange(d,c,t,p,w,h,u,r):this.handleEvent(Zt,d,c,t,p,w,h,u,r)}else this.checkExists(d,c,t,p,w,h,u,r);else switch(u.event){case Dc:case Fc:return this.addOrChange(d,c,t,p,w,h,u,r);case Lc:case Bc:return this.checkExists(d,c,t,p,w,h,u,r)}},this.fsw._emitRaw);return this.fsw._emitReady(),a}async _handleFsEventsSymlink(e,t,o,s){if(!(this.fsw.closed||this.fsw._symlinkPaths.has(t))){this.fsw._symlinkPaths.set(t,!0),this.fsw._incrReadyCount();try{let r=await Lr(e);if(this.fsw.closed)return;if(this.fsw._isIgnored(r))return this.fsw._emitReady();this.fsw._incrReadyCount(),this._addToFsEvents(r||e,i=>{let a=e;return r&&r!==Fr?a=i.replace(r,e):i!==Fr&&(a=X.join(e,i)),o(a)},!1,s)}catch(r){if(this.fsw._handleError(r))return this.fsw._emitReady()}}}emitAdd(e,t,o,s,r){let i=o(e),a=t.isDirectory(),c=this.fsw._getWatchedDir(X.dirname(i)),l=X.basename(i);a&&this.fsw._getWatchedDir(i),!c.has(l)&&(c.add(l),(!s.ignoreInitial||r===!0)&&this.fsw._emit(a?$r:tn,i,t))}initWatch(e,t,o,s){if(this.fsw.closed)return;let r=this._watchWithFsEvents(o.watchPath,X.resolve(e||o.watchPath),s,o.globFilter);this.fsw._addPathCloser(t,r)}async _addToFsEvents(e,t,o,s){if(this.fsw.closed)return;let r=this.fsw.options,i=typeof t===sn?t:qc,a=this.fsw._getWatchHelpers(e);try{let c=await Vc[a.statMethod](a.watchPath);if(this.fsw.closed)return;if(this.fsw._isIgnored(a.watchPath,c))throw null;if(c.isDirectory()){if(a.globFilter||this.emitAdd(i(e),c,i,r,o),s&&s>r.depth)return;this.fsw._readdirp(a.watchPath,{fileFilter:l=>a.filterPath(l),directoryFilter:l=>a.filterDir(l),...Uc(r.depth-(s||0))}).on(Mc,l=>{if(this.fsw.closed||l.stats.isDirectory()&&!a.filterPath(l))return;let u=X.join(a.watchPath,l.path),{fullPath:d}=l;if(a.followSymlinks&&l.stats.isSymbolicLink()){let p=r.depth===void 0?void 0:nn(u,X.resolve(a.watchPath))+1;this._handleFsEventsSymlink(u,d,i,p)}else this.emitAdd(u,l.stats,i,r,o)}).on(Ac,Wc).on($c,()=>{this.fsw._emitReady()})}else this.emitAdd(a.watchPath,c,i,r,o),this.fsw._emitReady()}catch(c){(!c||this.fsw._handleError(c))&&(this.fsw._emitReady(),this.fsw._emitReady())}if(r.persistent&&o!==!0)if(typeof t===sn)this.initWatch(void 0,e,a,i);else{let c;try{c=await Lr(a.watchPath)}catch{}this.initWatch(c,e,a,i)}}};ln.exports=rn;ln.exports.canUse=Jc});var Pn=H(Cn=>{"use strict";var{EventEmitter:Zc}=require("events"),kn=require("fs"),N=require("path"),{promisify:Vr}=require("util"),el=So(),gn=$o().default,tl=No(),dn=Ws(),sl=_r(),nl=Os(),ol=Mr(),Or=Nr(),{EV_ALL:pn,EV_READY:rl,EV_ADD:es,EV_CHANGE:kt,EV_UNLINK:jr,EV_ADD_DIR:il,EV_UNLINK_DIR:al,EV_RAW:cl,EV_ERROR:un,STR_CLOSE:ll,STR_END:dl,BACK_SLASH_RE:pl,DOUBLE_SLASH_RE:Wr,SLASH_OR_BACK_SLASH_RE:ul,DOT_RE:hl,REPLACER_RE:fl,SLASH:hn,SLASH_SLASH:gl,BRACE_START:ml,BANG:mn,ONE_DOT:zr,TWO_DOTS:wl,GLOBSTAR:vl,SLASH_GLOBSTAR:fn,ANYMATCH_OPTS:wn,STRING_TYPE:xn,FUNCTION_TYPE:yl,EMPTY_STR:vn,EMPTY_FN:bl,isWindows:_l,isMacos:kl,isIBMi:xl}=Kt(),Cl=Vr(kn.stat),Pl=Vr(kn.readdir),yn=(n=[])=>Array.isArray(n)?n:[n],Kr=(n,e=[])=>(n.forEach(t=>{Array.isArray(t)?Kr(t,e):e.push(t)}),e),qr=n=>{let e=Kr(yn(n));if(!e.every(t=>typeof t===xn))throw new TypeError(`Non-string provided as watch path: ${e}`);return e.map(Yr)},Ur=n=>{let e=n.replace(pl,hn),t=!1;for(e.startsWith(gl)&&(t=!0);e.match(Wr);)e=e.replace(Wr,hn);return t&&(e=hn+e),e},Yr=n=>Ur(N.normalize(Ur(n))),Gr=(n=vn)=>e=>typeof e!==xn?e:Yr(N.isAbsolute(e)?e:N.join(n,e)),Sl=(n,e)=>N.isAbsolute(n)?n:n.startsWith(mn)?mn+N.join(e,n.slice(1)):N.join(e,n),ye=(n,e)=>n[e]===void 0,bn=class{constructor(e,t){this.path=e,this._removeWatcher=t,this.items=new Set}add(e){let{items:t}=this;t&&e!==zr&&e!==wl&&t.add(e)}async remove(e){let{items:t}=this;if(!t||(t.delete(e),t.size>0))return;let o=this.path;try{await Pl(o)}catch{this._removeWatcher&&this._removeWatcher(N.dirname(o),N.basename(o))}}has(e){let{items:t}=this;if(t)return t.has(e)}getChildren(){let{items:e}=this;if(e)return[...e.values()]}dispose(){this.items.clear(),delete this.path,delete this._removeWatcher,delete this.items,Object.freeze(this)}},Rl="stat",El="lstat",_n=class{constructor(e,t,o,s){this.fsw=s,this.path=e=e.replace(fl,vn),this.watchPath=t,this.fullWatchPath=N.resolve(t),this.hasGlob=t!==e,e===vn&&(this.hasGlob=!1),this.globSymlink=this.hasGlob&&o?void 0:!1,this.globFilter=this.hasGlob?gn(e,void 0,wn):!1,this.dirParts=this.getDirParts(e),this.dirParts.forEach(r=>{r.length>1&&r.pop()}),this.followSymlinks=o,this.statMethod=o?Rl:El}checkGlobSymlink(e){return this.globSymlink===void 0&&(this.globSymlink=e.fullParentDir===this.fullWatchPath?!1:{realPath:e.fullParentDir,linkPath:this.fullWatchPath}),this.globSymlink?e.fullPath.replace(this.globSymlink.realPath,this.globSymlink.linkPath):e.fullPath}entryPath(e){return N.join(this.watchPath,N.relative(this.watchPath,this.checkGlobSymlink(e)))}filterPath(e){let{stats:t}=e;if(t&&t.isSymbolicLink())return this.filterDir(e);let o=this.entryPath(e);return(this.hasGlob&&typeof this.globFilter===yl?this.globFilter(o):!0)&&this.fsw._isntIgnored(o,t)&&this.fsw._hasReadPermissions(t)}getDirParts(e){if(!this.hasGlob)return[];let t=[];return(e.includes(ml)?sl.expand(e):[e]).forEach(s=>{t.push(N.relative(this.watchPath,s).split(ul))}),t}filterDir(e){if(this.hasGlob){let t=this.getDirParts(this.checkGlobSymlink(e)),o=!1;this.unmatchedGlob=!this.dirParts.some(s=>s.every((r,i)=>(r===vl&&(o=!0),o||!t[0][i]||gn(r,t[0][i],wn))))}return!this.unmatchedGlob&&this.fsw._isntIgnored(this.entryPath(e),e.stats)}},ts=class extends Zc{constructor(e){super();let t={};e&&Object.assign(t,e),this._watched=new Map,this._closers=new Map,this._ignoredPaths=new Set,this._throttled=new Map,this._symlinkPaths=new Map,this._streams=new Set,this.closed=!1,ye(t,"persistent")&&(t.persistent=!0),ye(t,"ignoreInitial")&&(t.ignoreInitial=!1),ye(t,"ignorePermissionErrors")&&(t.ignorePermissionErrors=!1),ye(t,"interval")&&(t.interval=100),ye(t,"binaryInterval")&&(t.binaryInterval=300),ye(t,"disableGlobbing")&&(t.disableGlobbing=!1),t.enableBinaryInterval=t.binaryInterval!==t.interval,ye(t,"useFsEvents")&&(t.useFsEvents=!t.usePolling),Or.canUse()||(t.useFsEvents=!1),ye(t,"usePolling")&&!t.useFsEvents&&(t.usePolling=kl),xl&&(t.usePolling=!0);let s=process.env.CHOKIDAR_USEPOLLING;if(s!==void 0){let c=s.toLowerCase();c==="false"||c==="0"?t.usePolling=!1:c==="true"||c==="1"?t.usePolling=!0:t.usePolling=!!c}let r=process.env.CHOKIDAR_INTERVAL;r&&(t.interval=Number.parseInt(r,10)),ye(t,"atomic")&&(t.atomic=!t.usePolling&&!t.useFsEvents),t.atomic&&(this._pendingUnlinks=new Map),ye(t,"followSymlinks")&&(t.followSymlinks=!0),ye(t,"awaitWriteFinish")&&(t.awaitWriteFinish=!1),t.awaitWriteFinish===!0&&(t.awaitWriteFinish={});let i=t.awaitWriteFinish;i&&(i.stabilityThreshold||(i.stabilityThreshold=2e3),i.pollInterval||(i.pollInterval=100),this._pendingWrites=new Map),t.ignored&&(t.ignored=yn(t.ignored));let a=0;this._emitReady=()=>{a++,a>=this._readyCount&&(this._emitReady=bl,this._readyEmitted=!0,process.nextTick(()=>this.emit(rl)))},this._emitRaw=(...c)=>this.emit(cl,...c),this._readyEmitted=!1,this.options=t,t.useFsEvents?this._fsEventsHandler=new Or(this):this._nodeFsHandler=new ol(this),Object.freeze(t)}add(e,t,o){let{cwd:s,disableGlobbing:r}=this.options;this.closed=!1;let i=qr(e);return s&&(i=i.map(a=>{let c=Sl(a,s);return r||!dn(a)?c:nl(c)})),i=i.filter(a=>a.startsWith(mn)?(this._ignoredPaths.add(a.slice(1)),!1):(this._ignoredPaths.delete(a),this._ignoredPaths.delete(a+fn),this._userIgnored=void 0,!0)),this.options.useFsEvents&&this._fsEventsHandler?(this._readyCount||(this._readyCount=i.length),this.options.persistent&&(this._readyCount+=i.length),i.forEach(a=>this._fsEventsHandler._addToFsEvents(a))):(this._readyCount||(this._readyCount=0),this._readyCount+=i.length,Promise.all(i.map(async a=>{let c=await this._nodeFsHandler._addToNodeFs(a,!o,0,0,t);return c&&this._emitReady(),c})).then(a=>{this.closed||a.filter(c=>c).forEach(c=>{this.add(N.dirname(c),N.basename(t||c))})})),this}unwatch(e){if(this.closed)return this;let t=qr(e),{cwd:o}=this.options;return t.forEach(s=>{!N.isAbsolute(s)&&!this._closers.has(s)&&(o&&(s=N.join(o,s)),s=N.resolve(s)),this._closePath(s),this._ignoredPaths.add(s),this._watched.has(s)&&this._ignoredPaths.add(s+fn),this._userIgnored=void 0}),this}close(){if(this.closed)return this._closePromise;this.closed=!0,this.removeAllListeners();let e=[];return this._closers.forEach(t=>t.forEach(o=>{let s=o();s instanceof Promise&&e.push(s)})),this._streams.forEach(t=>t.destroy()),this._userIgnored=void 0,this._readyCount=0,this._readyEmitted=!1,this._watched.forEach(t=>t.dispose()),["closers","watched","streams","symlinkPaths","throttled"].forEach(t=>{this[`_${t}`].clear()}),this._closePromise=e.length?Promise.all(e).then(()=>{}):Promise.resolve(),this._closePromise}getWatched(){let e={};return this._watched.forEach((t,o)=>{let s=this.options.cwd?N.relative(this.options.cwd,o):o;e[s||zr]=t.getChildren().sort()}),e}emitWithAll(e,t){this.emit(...t),e!==un&&this.emit(pn,...t)}async _emit(e,t,o,s,r){if(this.closed)return;let i=this.options;_l&&(t=N.normalize(t)),i.cwd&&(t=N.relative(i.cwd,t));let a=[e,t];r!==void 0?a.push(o,s,r):s!==void 0?a.push(o,s):o!==void 0&&a.push(o);let c=i.awaitWriteFinish,l;if(c&&(l=this._pendingWrites.get(t)))return l.lastChange=new Date,this;if(i.atomic){if(e===jr)return this._pendingUnlinks.set(t,a),setTimeout(()=>{this._pendingUnlinks.forEach((u,d)=>{this.emit(...u),this.emit(pn,...u),this._pendingUnlinks.delete(d)})},typeof i.atomic=="number"?i.atomic:100),this;e===es&&this._pendingUnlinks.has(t)&&(e=a[0]=kt,this._pendingUnlinks.delete(t))}if(c&&(e===es||e===kt)&&this._readyEmitted){let u=(d,p)=>{d?(e=a[0]=un,a[1]=d,this.emitWithAll(e,a)):p&&(a.length>2?a[2]=p:a.push(p),this.emitWithAll(e,a))};return this._awaitWriteFinish(t,c.stabilityThreshold,e,u),this}if(e===kt&&!this._throttle(kt,t,50))return this;if(i.alwaysStat&&o===void 0&&(e===es||e===il||e===kt)){let u=i.cwd?N.join(i.cwd,t):t,d;try{d=await Cl(u)}catch{}if(!d||this.closed)return;a.push(d)}return this.emitWithAll(e,a),this}_handleError(e){let t=e&&e.code;return e&&t!=="ENOENT"&&t!=="ENOTDIR"&&(!this.options.ignorePermissionErrors||t!=="EPERM"&&t!=="EACCES")&&this.emit(un,e),e||this.closed}_throttle(e,t,o){this._throttled.has(e)||this._throttled.set(e,new Map);let s=this._throttled.get(e),r=s.get(t);if(r)return r.count++,!1;let i,a=()=>{let l=s.get(t),u=l?l.count:0;return s.delete(t),clearTimeout(i),l&&clearTimeout(l.timeoutObject),u};i=setTimeout(a,o);let c={timeoutObject:i,clear:a,count:0};return s.set(t,c),c}_incrReadyCount(){return this._readyCount++}_awaitWriteFinish(e,t,o,s){let r,i=e;this.options.cwd&&!N.isAbsolute(e)&&(i=N.join(this.options.cwd,e));let a=new Date,c=l=>{kn.stat(i,(u,d)=>{if(u||!this._pendingWrites.has(e)){u&&u.code!=="ENOENT"&&s(u);return}let p=Number(new Date);l&&d.size!==l.size&&(this._pendingWrites.get(e).lastChange=p);let h=this._pendingWrites.get(e);p-h.lastChange>=t?(this._pendingWrites.delete(e),s(void 0,d)):r=setTimeout(c,this.options.awaitWriteFinish.pollInterval,d)})};this._pendingWrites.has(e)||(this._pendingWrites.set(e,{lastChange:a,cancelWait:()=>(this._pendingWrites.delete(e),clearTimeout(r),o)}),r=setTimeout(c,this.options.awaitWriteFinish.pollInterval))}_getGlobIgnored(){return[...this._ignoredPaths.values()]}_isIgnored(e,t){if(this.options.atomic&&hl.test(e))return!0;if(!this._userIgnored){let{cwd:o}=this.options,s=this.options.ignored,r=s&&s.map(Gr(o)),i=yn(r).filter(c=>typeof c===xn&&!dn(c)).map(c=>c+fn),a=this._getGlobIgnored().map(Gr(o)).concat(r,i);this._userIgnored=gn(a,void 0,wn)}return this._userIgnored([e,t])}_isntIgnored(e,t){return!this._isIgnored(e,t)}_getWatchHelpers(e,t){let o=t||this.options.disableGlobbing||!dn(e)?e:tl(e),s=this.options.followSymlinks;return new _n(e,o,s,this)}_getWatchedDir(e){this._boundRemove||(this._boundRemove=this._remove.bind(this));let t=N.resolve(e);return this._watched.has(t)||this._watched.set(t,new bn(t,this._boundRemove)),this._watched.get(t)}_hasReadPermissions(e){if(this.options.ignorePermissionErrors)return!0;let o=(e&&Number.parseInt(e.mode,10))&511;return!!(4&Number.parseInt(o.toString(8)[0],10))}_remove(e,t,o){let s=N.join(e,t),r=N.resolve(s);if(o=o??(this._watched.has(s)||this._watched.has(r)),!this._throttle("remove",s,100))return;!o&&!this.options.useFsEvents&&this._watched.size===1&&this.add(e,t,!0),this._getWatchedDir(s).getChildren().forEach(p=>this._remove(s,p));let c=this._getWatchedDir(e),l=c.has(t);c.remove(t),this._symlinkPaths.has(r)&&this._symlinkPaths.delete(r);let u=s;if(this.options.cwd&&(u=N.relative(this.options.cwd,s)),this.options.awaitWriteFinish&&this._pendingWrites.has(u)&&this._pendingWrites.get(u).cancelWait()===es)return;this._watched.delete(s),this._watched.delete(r);let d=o?al:jr;l&&!this._isIgnored(s)&&this._emit(d,s),this.options.useFsEvents||this._closePath(s)}_closePath(e){this._closeFile(e);let t=N.dirname(e);this._getWatchedDir(t).remove(N.basename(e))}_closeFile(e){let t=this._closers.get(e);t&&(t.forEach(o=>o()),this._closers.delete(e))}_addPathCloser(e,t){if(!t)return;let o=this._closers.get(e);o||(o=[],this._closers.set(e,o)),o.push(t)}_readdirp(e,t){if(this.closed)return;let o={type:pn,alwaysStat:!0,lstat:!0,...t},s=el(e,o);return this._streams.add(s),s.once(ll,()=>{s=void 0}),s.once(dl,()=>{s&&(this._streams.delete(s),s=void 0)}),s}};Cn.FSWatcher=ts;var Tl=(n,e)=>{let t=new ts(e);return t.add(n),t};Cn.watch=Tl});var Ll={};vi(Ll,{activate:()=>Ml,deactivate:()=>$l,ensureServerRunning:()=>Vn});module.exports=yi(Ll);var U=P(require("vscode"));var M=P(require("vscode"));var Ve=P(require("fs")),Ce=P(require("path")),Yn=P(require("crypto")),lt=new Map;function Kn(n){let e=Ce.join(n,".projectmemory","identity.json");try{if(!Ve.existsSync(e))return null;let t=Ve.readFileSync(e,"utf-8"),o=JSON.parse(t);return!o.workspace_id||!o.workspace_path?null:{workspaceId:o.workspace_id,workspaceName:Ce.basename(o.workspace_path),projectPath:o.workspace_path}}catch{return null}}function fe(n){let e=Ce.normalize(n);if(console.log("[PM Identity] Resolving identity for:",e),lt.has(e)){let o=lt.get(e);return console.log("[PM Identity] Cache hit:",o?.workspaceId??"null"),o??null}let t=Kn(e);if(t)return console.log("[PM Identity] Found at root:",t.workspaceId),lt.set(e,t),t;try{let o=Ve.readdirSync(e,{withFileTypes:!0});console.log("[PM Identity] Scanning",o.length,"entries in root");for(let s of o){if(!s.isDirectory()||s.name.startsWith(".")||s.name==="node_modules")continue;let r=Ce.join(e,s.name);if(t=Kn(r),t)return console.log("[PM Identity] Found in subdir:",s.name,"->",t.workspaceId),lt.set(e,t),t}}catch(o){console.log("[PM Identity] Scan error:",o)}return console.log("[PM Identity] No identity found, caching null"),lt.set(e,null),null}function dt(n){let e=Ce.normalize(n).toLowerCase(),t=Yn.createHash("sha256").update(e).digest("hex").substring(0,12);return`${Ce.basename(n).replace(/[^a-zA-Z0-9-_]/g,"-")}-${t}`}var Xn=P(require("http")),pt=P(require("vscode"));function Qn(n,e=3e3){return new Promise(t=>{let o=Xn.get(n,s=>{if(s.statusCode!==200){t(null),s.resume();return}let r="";s.on("data",i=>{r+=i.toString()}),s.on("end",()=>{try{let i=JSON.parse(r);i?.status==="ok"?t(i):t(null)}catch{t(null)}})});o.on("error",()=>t(null)),o.setTimeout(e,()=>{o.destroy(),t(null)})})}async function Cs(n=3e3,e=3001){let[t,o]=await Promise.all([Qn(`http://localhost:${n}/health`),Qn(`http://localhost:${e}/api/health`)]);return{detected:t!==null&&o!==null,mcpHealthy:t!==null,dashboardHealthy:o!==null,mcpInfo:t||void 0,dashboardInfo:o||void 0}}function Ps(){return pt.workspace.getConfiguration("projectMemory").get("containerMode","auto")}function Dt(){return pt.workspace.getConfiguration("projectMemory").get("containerMcpPort",3e3)}function He(){let n=pt.workspace.getConfiguration("projectMemory"),e=n.get("containerMode","auto"),t=n.get("serverPort",3001);return e==="local"?"http://localhost:5173":`http://localhost:${t}`}async function Jn(){let n=Ps();if(n==="local")return{useContainer:!1,status:{detected:!1,mcpHealthy:!1,dashboardHealthy:!1}};let e=Dt(),o=pt.workspace.getConfiguration("projectMemory").get("serverPort",3001),s=await Cs(e,o);return n==="container"?{useContainer:!0,status:s}:{useContainer:s.detected,status:s}}function Ss(n,...e){return M.workspace.getConfiguration("projectMemory").get("showNotifications",!0)?M.window.showInformationMessage(n,...e):Promise.resolve(void 0)}var Ft=class{constructor(e,t,o){this._extensionUri=e;this._dataRoot=t,this._agentsRoot=o}static viewType="projectMemory.dashboardView";_view;_dataRoot;_agentsRoot;_disposables=[];_onResolveCallback;onFirstResolve(e){this._onResolveCallback=e}dispose(){for(;this._disposables.length;){let e=this._disposables.pop();e&&e.dispose()}}getWorkspaceId(){let e=M.workspace.workspaceFolders?.[0];if(!e)return null;let t=e.uri.fsPath;console.log("[PM Debug] getWorkspaceId for fsPath:",t);let o=fe(t);if(o)return console.log("[PM Debug] Found identity:",o.workspaceId,"from",o.projectPath),o.workspaceId;let s=dt(t);return console.log("[PM Debug] Using fallback ID:",s),s}getWorkspaceName(){let e=M.workspace.workspaceFolders?.[0];if(!e)return"No workspace";let t=fe(e.uri.fsPath);return t?t.workspaceName:e.name}resolveWebviewView(e,t,o){this._onResolveCallback&&(this._onResolveCallback(),this._onResolveCallback=void 0),this.dispose(),this._view=e,e.webview.options={enableScripts:!0,localResourceRoots:[M.Uri.joinPath(this._extensionUri,"webview","dist"),M.Uri.joinPath(this._extensionUri,"resources")]},e.webview.html=this._getHtmlForWebview(e.webview),this._disposables.push(e.onDidDispose(()=>{this._view=void 0})),this._disposables.push(e.webview.onDidReceiveMessage(async s=>{switch(console.log("Received message from webview:",s),s.type){case"openFile":let{filePath:r,line:i}=s.data;M.commands.executeCommand("projectMemory.openFile",r,i);break;case"runCommand":let{command:a}=s.data;console.log("Executing command:",a);try{await M.commands.executeCommand(a),console.log("Command executed successfully")}catch(_){console.error("Command execution failed:",_),M.window.showErrorMessage(`Command failed: ${_}`)}break;case"openExternal":let{url:c}=s.data;console.log("Opening dashboard panel:",c),M.commands.executeCommand("projectMemory.openDashboardPanel",c);break;case"openPlan":let{planId:l,workspaceId:u}=s.data,d=`${this.getDashboardUrl()}/workspace/${u}/plan/${l}`;console.log("Opening plan:",d),M.commands.executeCommand("projectMemory.openDashboardPanel",d);break;case"openPlanRoute":await this.openPlanRoute(s.data);break;case"planAction":await this.runPlanAction(s.data);break;case"isolateServer":await M.commands.executeCommand("projectMemory.isolateServer");break;case"copyToClipboard":let{text:p}=s.data;await M.env.clipboard.writeText(p),Ss(`Copied to clipboard: ${p}`);break;case"showNotification":let{level:h,text:w}=s.data;h==="error"?M.window.showErrorMessage(w):h==="warning"?M.window.showWarningMessage(w):Ss(w);break;case"revealInExplorer":let{path:v}=s.data;M.commands.executeCommand("revealInExplorer",M.Uri.file(v));break;case"getConfig":this.postMessage({type:"config",data:{dataRoot:this._dataRoot,agentsRoot:this._agentsRoot,workspaceFolders:M.workspace.workspaceFolders?.map(_=>({name:_.name,path:_.uri.fsPath}))||[]}});break;case"ready":this.postMessage({type:"init",data:{dataRoot:this._dataRoot,agentsRoot:this._agentsRoot}});break}}))}postMessage(e){this._view&&this._view.webview.postMessage(e)}updateConfig(e,t){this._dataRoot=e,this._agentsRoot=t,this.postMessage({type:"configUpdated",data:{dataRoot:e,agentsRoot:t}})}getApiPort(){let e=M.workspace.getConfiguration("projectMemory");return e.get("serverPort")||e.get("apiPort")||3001}getDashboardUrl(){return He()}async pickPlan(){let e=this.getWorkspaceId();if(!e)return M.window.showErrorMessage("No workspace is open."),null;let t=this.getApiPort();try{let o=await fetch(`http://localhost:${t}/api/plans/workspace/${e}`);if(!o.ok)return M.window.showErrorMessage("Failed to load plans from the dashboard server."),null;let s=await o.json(),r=Array.isArray(s.plans)?s.plans:[];if(r.length===0)return M.window.showInformationMessage("No plans found for this workspace."),null;let i=await M.window.showQuickPick(r.map(a=>{let c=a.id||a.plan_id||"unknown";return{label:a.title||c,description:a.status||"unknown",detail:c}}),{placeHolder:"Select a plan"});return!i||!i.detail?null:{workspaceId:e,planId:i.detail}}catch(o){return M.window.showErrorMessage(`Failed to load plans: ${o}`),null}}async openPlanRoute(e){let t=await this.pickPlan();if(!t)return;let{workspaceId:o,planId:s}=t,r=`${this.getDashboardUrl()}/workspace/${o}/plan/${s}`;e.route==="context"?r+="/context":e.route==="build-scripts"&&(r+="/build-scripts"),e.query&&(r+=`?${e.query}`),M.commands.executeCommand("projectMemory.openDashboardPanel",r)}async runPlanAction(e){let t=await this.pickPlan();if(!t)return;let{workspaceId:o,planId:s}=t,r=e.action==="archive"?"Archive":"Resume";if(e.action==="archive"&&await M.window.showWarningMessage(`Archive plan ${s}?`,{modal:!0},"Archive")!=="Archive")return;let i=this.getApiPort();try{let a=await fetch(`http://localhost:${i}/api/plans/${o}/${s}/${e.action}`,{method:"POST"});if(!a.ok){let l=await a.text();M.window.showErrorMessage(`Failed to ${e.action} plan: ${l}`);return}Ss(`${r}d plan ${s}`);let c=`${this.getDashboardUrl()}/workspace/${o}/plan/${s}`;M.commands.executeCommand("projectMemory.openDashboardPanel",c)}catch(a){M.window.showErrorMessage(`Failed to ${e.action} plan: ${a}`)}}_getHtmlForWebview(e){let t=bi(),o=M.workspace.getConfiguration("projectMemory"),s=o.get("serverPort")||o.get("apiPort")||3001,r=He(),i=this.getWorkspaceId()||"",a=this.getWorkspaceName(),c=JSON.stringify(this._dataRoot),l={dashboard:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>',knowledgeBase:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6.5 15.5H20"/></svg>',contextFiles:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>',contextFilesGrid:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="M3 15h6"/><path d="M15 3v18"/><path d="M15 9h6"/></svg>',agents:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/></svg>',syncHistory:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/></svg>',diagnostics:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',newTemplate:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="M12 5v14"/></svg>',resumePlan:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 3l14 9-14 9V3z"/></svg>',archive:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>',addContextNote:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3z"/><path d="M15 3v6h6"/><path d="M9 18h6"/><path d="M10 14h4"/></svg>',researchNote:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/><path d="M15 12h-9"/></svg>',createNewPlan:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v4"/><circle cx="18" cy="18" r="3"/><path d="M18 15v6"/><path d="M15 18h6"/></svg>',deployAgents:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v9"/><path d="m16 11 3-3 3 3"/></svg>',deployInstructions:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6.5 15.5H20"/><path d="M14 11V7"/><path d="m11 10 3-3 3 3"/></svg>',deployPrompts:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 11 2-2-2-2"/><path d="M11 9h4"/><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M12 15v4"/><path d="m9 18 3-3 3 3"/></svg>',configureDefaults:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/><path d="m9 12 2 2 4-4"/></svg>',deployAllDefaults:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14"/><path d="M16.5 9.4 7.55 4.24"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/><path d="M17 13h5"/><path d="M17 17h5"/><path d="M17 21h5"/></svg>',handoffEvent:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m16 13 4 4-4 4"/><path d="M20 17H4a2 2 0 0 1-2-2V5"/></svg>',noteEvent:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',stepUpdate:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',searchBox:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',buildScript:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',runButton:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>',stopStale:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="10" height="10" x="7" y="7" rx="2"/></svg>',healthBadge:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',dataRoot:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="3" y2="15"/></svg>',agentHandoff:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></svg>',isolate:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/><path d="M15 3v18"/></svg>'},u=JSON.stringify(l);return`<!DOCTYPE html>
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
            ${l.isolate}
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
        const apiPort = ${s};
        const dashboardUrl = '${r}';
        const workspaceId = '${i}';
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
                                    ${l.searchBox}
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
                                            <li><span class="label">API Port:</span> <span>${s}</span></li>
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
                                                ${l.dashboard}
                                            </button>
                                            <button class="icon-btn" data-action="refresh" title="Refresh Status">
                                                ${l.syncHistory}
                                            </button>
                                            <button class="icon-btn" data-action="run-command" data-command="projectMemory.createPlan" title="Create New Plan">
                                                ${l.createNewPlan}
                                            </button>
                                            <button class="icon-btn" data-action="run-command" data-command="projectMemory.deployAgents" title="Deploy Agents">
                                                ${l.deployAgents}
                                            </button>
                                            <button class="icon-btn" data-action="run-command" data-command="projectMemory.deployInstructions" title="Deploy Instructions">
                                                ${l.deployInstructions}
                                            </button>
                                            <button class="icon-btn" data-action="run-command" data-command="projectMemory.deployPrompts" title="Deploy Prompts">
                                                ${l.deployPrompts}
                                            </button>
                                            <button class="icon-btn" data-action="open-resume-plan" title="Resume Plan">
                                                ${l.resumePlan}
                                            </button>
                                            <button class="icon-btn" data-action="open-archive-plan" title="Archive Plan">
                                                ${l.archive}
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
                                                        ${l.configureDefaults}
                                                    </button>
                                                    <button class="icon-btn" data-action="run-command" data-command="projectMemory.deployDefaults" title="Deploy All Defaults">
                                                        ${l.deployAllDefaults}
                                                    </button>
                                                </div>
                                            </div>
                                            <div class="stacked-section">
                                                <div class="icon-row-title">Context</div>
                                                <div class="icon-grid">
                                                    <button class="icon-btn" data-action="open-context-note" title="Add Context Note">
                                                        ${l.addContextNote}
                                                    </button>
                                                    <button class="icon-btn" data-action="open-research-note" title="Add Research Note">
                                                        ${l.researchNote}
                                                    </button>
                                                    <button class="icon-btn" data-action="open-context-files" title="View Context Files">
                                                        ${l.contextFilesGrid}
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
                                                ${l.buildScript}
                                            </button>
                                            <button class="icon-btn" data-action="open-run-script" title="Run Script">
                                                ${l.runButton}
                                            </button>
                                            <button class="icon-btn" data-action="open-handoff" title="Agent Handoff">
                                                ${l.agentHandoff}
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
</html>`}};function bi(){let n="",e="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";for(let t=0;t<32;t++)n+=e.charAt(Math.floor(Math.random()*e.length));return n}var Je=P(require("vscode")),Qr=P(Pn()),xt=P(require("path"));function Sn(n,...e){return Je.workspace.getConfiguration("projectMemory").get("showNotifications",!0)?Je.window.showInformationMessage(n,...e):Promise.resolve(void 0)}var ss=class n{watcher=null;agentsRoot;autoDeploy;debounceTimer=null;pendingChanges=new Set;static DEBOUNCE_MS=500;constructor(e,t){this.agentsRoot=e,this.autoDeploy=t}start(){if(this.watcher)return;let e=xt.join(this.agentsRoot,"*.agent.md");this.watcher=Qr.watch(e,{persistent:!0,ignoreInitial:!0}),this.watcher.on("change",t=>{this.pendingChanges.add(t),this.scheduleFlush()}),this.watcher.on("add",t=>{let o=xt.basename(t,".agent.md");Sn(`New agent template detected: ${o}`)}),console.log(`Agent watcher started for: ${e}`)}scheduleFlush(){this.debounceTimer&&clearTimeout(this.debounceTimer),this.debounceTimer=setTimeout(()=>this.flushChanges(),n.DEBOUNCE_MS)}async flushChanges(){let e=[...this.pendingChanges];if(this.pendingChanges.clear(),this.debounceTimer=null,e.length===0)return;let t=e.map(s=>xt.basename(s,".agent.md")),o=t.length===1?t[0]:`${t.length} agents`;this.autoDeploy?Sn(`Deploying updated ${o}`):await Sn(`Agent template${t.length>1?"s":""} updated: ${o}`,"Deploy to All Workspaces","Ignore")==="Deploy to All Workspaces"&&Je.commands.executeCommand("projectMemory.deployAgents")}stop(){this.debounceTimer&&(clearTimeout(this.debounceTimer),this.debounceTimer=null),this.pendingChanges.clear(),this.watcher&&(this.watcher.close(),this.watcher=null,console.log("Agent watcher stopped"))}setAutoDeploy(e){this.autoDeploy=e}};var We=P(require("vscode")),Xr=P(Pn()),os=P(require("path"));function Rn(n,...e){return We.workspace.getConfiguration("projectMemory").get("showNotifications",!0)?We.window.showInformationMessage(n,...e):Promise.resolve(void 0)}var ns=class n{watchers=new Map;config;onFileChange;debounceTimer=null;pendingEvents=new Map;static DEBOUNCE_MS=300;constructor(e){this.config=e}start(){this.config.agentsRoot&&this.startWatcher("agent",this.config.agentsRoot,"*.agent.md"),this.config.promptsRoot&&this.startWatcher("prompt",this.config.promptsRoot,"*.prompt.md"),this.config.instructionsRoot&&this.startWatcher("instruction",this.config.instructionsRoot,"*.instructions.md")}startWatcher(e,t,o){if(this.watchers.has(e))return;let s=os.join(t,o),r=Xr.watch(s,{persistent:!0,ignoreInitial:!0});r.on("change",async i=>{this.handleFileEvent(e,i,"change")}),r.on("add",i=>{this.handleFileEvent(e,i,"add")}),r.on("unlink",i=>{this.handleFileEvent(e,i,"unlink")}),this.watchers.set(e,r),console.log(`${e} watcher started for: ${s}`)}async handleFileEvent(e,t,o){this.pendingEvents.set(t,{type:e,filePath:t,action:o}),this.debounceTimer&&clearTimeout(this.debounceTimer),this.debounceTimer=setTimeout(()=>this.flushEvents(),n.DEBOUNCE_MS)}async flushEvents(){let e=[...this.pendingEvents.values()];this.pendingEvents.clear(),this.debounceTimer=null;for(let{type:t,filePath:o,action:s}of e)await this.processFileEvent(t,o,s)}async processFileEvent(e,t,o){let s=os.basename(t),i={agent:"Agent template",prompt:"Prompt file",instruction:"Instruction file"}[e];if(this.onFileChange&&this.onFileChange(e,t,o),o==="unlink"){We.window.showWarningMessage(`${i} deleted: ${s}`);return}if(o==="add"){Rn(`New ${i.toLowerCase()} detected: ${s}`);return}this.config.autoDeploy?(Rn(`Auto-deploying updated ${i.toLowerCase()}: ${s}`),this.triggerDeploy(e)):await Rn(`${i} updated: ${s}`,"Deploy to All Workspaces","Ignore")==="Deploy to All Workspaces"&&this.triggerDeploy(e)}triggerDeploy(e){let t={agent:"projectMemory.deployAgents",prompt:"projectMemory.deployPrompts",instruction:"projectMemory.deployInstructions"};We.commands.executeCommand(t[e])}stop(){this.debounceTimer&&(clearTimeout(this.debounceTimer),this.debounceTimer=null),this.pendingEvents.clear();for(let[e,t]of this.watchers)t.close(),console.log(`${e} watcher stopped`);this.watchers.clear()}updateConfig(e){this.stop(),this.config={...this.config,...e},this.start()}setAutoDeploy(e){this.config.autoDeploy=e}onFileChanged(e){this.onFileChange=e}getWatchedPaths(){let e=[];return this.config.agentsRoot&&e.push({type:"agent",path:this.config.agentsRoot}),this.config.promptsRoot&&e.push({type:"prompt",path:this.config.promptsRoot}),this.config.instructionsRoot&&e.push({type:"instruction",path:this.config.instructionsRoot}),e}};var is=P(require("vscode")),rs=class{statusBarItem;currentAgent=null;currentPlan=null;constructor(){this.statusBarItem=is.window.createStatusBarItem(is.StatusBarAlignment.Left,100),this.statusBarItem.command="projectMemory.showDashboard",this.updateDisplay(),this.statusBarItem.show()}setCurrentAgent(e){this.currentAgent=e,this.updateDisplay()}setCurrentPlan(e){this.currentPlan=e,this.updateDisplay()}updateDisplay(){this.currentAgent&&this.currentPlan?(this.statusBarItem.text=`$(robot) ${this.currentAgent} \xB7 ${this.currentPlan}`,this.statusBarItem.tooltip=`Project Memory: ${this.currentAgent} working on "${this.currentPlan}"`):this.currentAgent?(this.statusBarItem.text=`$(robot) ${this.currentAgent}`,this.statusBarItem.tooltip=`Project Memory: ${this.currentAgent} active`):(this.statusBarItem.text="$(robot) Project Memory",this.statusBarItem.tooltip="Click to open Project Memory Dashboard")}showTemporaryMessage(e,t=3e3){let o=this.statusBarItem.text,s=this.statusBarItem.tooltip;this.statusBarItem.text=`$(sync~spin) ${e}`,this.statusBarItem.tooltip=e,setTimeout(()=>{this.statusBarItem.text=o,this.statusBarItem.tooltip=s},t)}setCopilotStatus(e){e.agents+e.prompts+e.instructions>0?(this.statusBarItem.text=`$(robot) PM (${e.agents}A/${e.prompts}P/${e.instructions}I)`,this.statusBarItem.tooltip=`Project Memory
Agents: ${e.agents}
Prompts: ${e.prompts}
Instructions: ${e.instructions}`):this.updateDisplay()}dispose(){this.statusBarItem.dispose()}};var ie=P(require("vscode")),us=require("child_process"),ri=P(require("path"));var An=require("child_process");var Tn=P(require("http")),Re=P(require("path")),Ze=P(require("vscode")),En=require("child_process");function as(n){return new Promise(e=>{let t=Tn.get(`http://localhost:${n}/api/health`,o=>{if(o.statusCode!==200){e(!1),o.resume();return}let s="";o.on("data",r=>{s+=r.toString()}),o.on("end",()=>{try{let r=JSON.parse(s);e(r?.status==="ok")}catch{e(!1)}})});t.on("error",()=>e(!1)),t.setTimeout(1e3,()=>{t.destroy(),e(!1)})})}function In(n){return new Promise(e=>{let t=Tn.get(`http://localhost:${n}`,o=>{e(o.statusCode!==void 0)});t.on("error",()=>e(!1)),t.setTimeout(1e3,()=>{t.destroy(),e(!1)})})}async function Jr(n,e){let t=Date.now();for(;Date.now()-t<e;){try{if(await as(n))return!0}catch{}await ni(500)}return!1}async function Zr(n,e){let t=Date.now();for(;Date.now()-t<e;){try{if(await In(n))return!0}catch{}await ni(500)}return!1}function cs(n){return new Promise(e=>{if(process.platform==="win32"){(0,En.exec)(`netstat -ano -p tcp | findstr :${n}`,{windowsHide:!0},(t,o)=>{if(t||!o){e(null);return}let s=o.split(/\r?\n/).map(r=>r.trim()).filter(Boolean);for(let r of s){if(!r.includes(`:${n}`)||!/LISTENING/i.test(r))continue;let i=r.match(/LISTENING\s+(\d+)/i);if(i){e(Number(i[1]));return}}e(null)});return}(0,En.exec)(`lsof -iTCP:${n} -sTCP:LISTEN -t`,(t,o)=>{if(t||!o){e(null);return}let s=o.split(/\r?\n/).find(i=>i.trim().length>0);if(!s){e(null);return}let r=Number(s.trim());e(Number.isNaN(r)?null:r)})})}function ei(n){let e=Ze.extensions.getExtension("project-memory.project-memory-dashboard")?.extensionPath,t=Ze.workspace.workspaceFolders?.[0]?.uri.fsPath,o=[e?Re.join(e,"server"):null,"c:\\Users\\codi.f\\vscode_ModularAgenticProcedureSystem\\dashboard\\server","c:\\Users\\User\\Project_Memory_MCP\\Project-Memory-MCP\\dashboard\\server",t?Re.join(t,"dashboard","server"):null,e?Re.join(e,"..","dashboard","server"):null].filter(Boolean),s=require("fs");for(let r of o)if(s.existsSync(Re.join(r,"package.json")))return n?.(`Found server at: ${r}`),r;return null}function ti(n){let e=Ze.extensions.getExtension("project-memory.project-memory-dashboard")?.extensionPath,t=Ze.workspace.workspaceFolders?.[0]?.uri.fsPath,o=[e?Re.join(e,"dashboard"):null,"c:\\Users\\codi.f\\vscode_ModularAgenticProcedureSystem\\dashboard","c:\\Users\\User\\Project_Memory_MCP\\Project-Memory-MCP\\dashboard",t?Re.join(t,"dashboard"):null,e?Re.join(e,"..","dashboard"):null].filter(Boolean),s=require("fs");for(let r of o)if(s.existsSync(Re.join(r,"package.json")))return n?.(`Found dashboard at: ${r}`),r;return n?.("Could not find dashboard directory for frontend"),null}async function si(n,e){let t=Date.now(),o=await n(),s=Date.now()-t;return e.apiCalls++,e.avgResponseTime=(e.avgResponseTime*(e.apiCalls-1)+s)/e.apiCalls,e.lastCheck=Date.now(),o}function ni(n){return new Promise(e=>setTimeout(e,n))}var ls=class{frontendProcess=null;_isFrontendRunning=!1;_isExternalFrontend=!1;logger;config;constructor(e,t){this.config=e,this.logger=t}get isRunning(){return this._isFrontendRunning}get isExternal(){return this._isExternalFrontend}async start(){if(this._isFrontendRunning)return this.logger("Frontend is already running"),!0;if(await In(5173))return this.logger("Found existing frontend on port 5173 - using it"),this._isFrontendRunning=!0,this._isExternalFrontend=!0,!0;let t=ti(this.logger);if(!t)return this.logger("Could not find dashboard directory for frontend"),!1;this.logger(`Starting frontend from: ${t}`);try{let o=process.platform==="win32"?"npm.cmd":"npm",s=["run","dev"];return this.frontendProcess=(0,An.spawn)(o,s,{cwd:t,shell:!0,windowsHide:!0,env:{...process.env,VITE_API_URL:`http://localhost:${this.config.serverPort||3001}`}}),this.frontendProcess.stdout?.on("data",i=>{this.logger(`[frontend] ${i.toString().trim()}`)}),this.frontendProcess.stderr?.on("data",i=>{this.logger(`[frontend] ${i.toString().trim()}`)}),this.frontendProcess.on("error",i=>{this.logger(`Frontend error: ${i.message}`),this._isFrontendRunning=!1}),this.frontendProcess.on("exit",(i,a)=>{this.logger(`Frontend exited with code ${i}, signal ${a}`),this._isFrontendRunning=!1,this.frontendProcess=null}),await Zr(5173,15e3)?(this._isFrontendRunning=!0,this.logger("Frontend started successfully on port 5173"),!0):(this.logger("Frontend failed to start within timeout"),!1)}catch(o){return this.logger(`Failed to start frontend: ${o}`),!1}}async stop(){if(this._isExternalFrontend){this.logger("Disconnecting from external frontend (not stopping it)"),this._isFrontendRunning=!1,this._isExternalFrontend=!1;return}if(this.frontendProcess)return this.logger("Stopping frontend..."),new Promise(e=>{if(!this.frontendProcess){e();return}let t=setTimeout(()=>{this.frontendProcess&&(this.logger("Force killing frontend..."),this.frontendProcess.kill("SIGKILL")),e()},5e3);this.frontendProcess.on("exit",()=>{clearTimeout(t),this._isFrontendRunning=!1,this.frontendProcess=null,this.logger("Frontend stopped"),e()}),process.platform==="win32"?(0,An.spawn)("taskkill",["/pid",String(this.frontendProcess.pid),"/f","/t"],{windowsHide:!0}):this.frontendProcess.kill("SIGTERM")})}dispose(){this.stop()}};var Ae=P(require("fs")),Ee=P(require("path")),Il=1024*1024;function Mn(n,e,t){try{let o=Ee.join(n,"logs");Ae.mkdirSync(o,{recursive:!0});let s=Ee.join(o,e);try{if(Ae.statSync(s).size>Il){let i=Ee.basename(e,Ee.extname(e)),a=Ee.extname(e),c=Ee.join(o,`${i}.${Date.now()}${a}`);Ae.renameSync(s,c)}}catch{}Ae.appendFileSync(s,t+`
`)}catch{}}function oi(n,e,t={}){let o=JSON.stringify({timestamp:new Date().toISOString(),event:e,...t});Mn(n,"process-audit.log",o)}var Me=P(require("fs")),ps=P(require("path")),ds=class{lockfilePath;windowId;constructor(e){this.lockfilePath=ps.join(e,"server.lock"),this.windowId=`${process.pid}-${Math.random().toString(36).slice(2,8)}`}acquire(e){let t=this.read();return t&&this.isProcessAlive(t.pid)?!1:(this.write(e),!0)}release(){let e=this.read();if(e&&e.windowId===this.windowId)try{Me.unlinkSync(this.lockfilePath)}catch{}}isOwner(){return this.read()?.windowId===this.windowId}isOwnedByOther(){let e=this.read();return!e||e.windowId===this.windowId?!1:this.isProcessAlive(e.pid)}isStale(){let e=this.read();return e?!this.isProcessAlive(e.pid):!1}read(){try{let e=Me.readFileSync(this.lockfilePath,"utf-8");return JSON.parse(e)}catch{return null}}write(e){let t={pid:process.pid,port:e,windowId:this.windowId,timestamp:new Date().toISOString()};try{Me.mkdirSync(ps.dirname(this.lockfilePath),{recursive:!0}),Me.writeFileSync(this.lockfilePath,JSON.stringify(t,null,2))}catch(o){console.error("Failed to write PID lockfile:",o)}}isProcessAlive(e){try{return process.kill(e,0),!0}catch{return!1}}};function $n(n,...e){return ie.workspace.getConfiguration("projectMemory").get("showNotifications",!0)?ie.window.showInformationMessage(n,...e):Promise.resolve(void 0)}var hs=class{serverProcess=null;ownedServerPid=null;outputChannel;statusBarItem;_isRunning=!1;_isExternalServer=!1;_isContainerMode=!1;_containerHealthTimer=null;_intentionalStop=!1;config;restartAttempts=0;maxRestartAttempts=3;_performanceStats={apiCalls:0,avgResponseTime:0,lastCheck:Date.now()};frontendManager;idleCheckTimer=null;lastActivityTime=Date.now();lockfile;constructor(e){this.config=e,this.outputChannel=ie.window.createOutputChannel("Project Memory Server"),this.statusBarItem=ie.window.createStatusBarItem(ie.StatusBarAlignment.Right,100),this.statusBarItem.command="projectMemory.toggleServer",this.lockfile=new ds(e.dataRoot),this.frontendManager=new ls({serverPort:e.serverPort||3001},t=>this.log(t))}get isRunning(){return this._isRunning}get isFrontendRunning(){return this.frontendManager.isRunning}get isExternalServer(){return this._isExternalServer}get isContainerMode(){return this._isContainerMode}get performanceStats(){return{...this._performanceStats}}startIdleMonitoring(e){e<=0||(this.resetIdleTimer(),this.log(`Idle server timeout enabled: ${e} minutes`),this.idleCheckTimer=setInterval(()=>{if(!this._isRunning||this._isExternalServer)return;let t=Date.now()-this.lastActivityTime,o=e*60*1e3;t>=o&&(this.log(`Server idle for ${Math.floor(t/6e4)}min \u2014 shutting down`),this.logEvent("server_idle_shutdown",{idleMinutes:Math.floor(t/6e4),timeoutMinutes:e}),this.stop(),$n("Project Memory server stopped due to inactivity. It will restart on next use."))},6e4))}resetIdleTimer(){this.lastActivityTime=Date.now()}stopIdleMonitoring(){this.idleCheckTimer&&(clearInterval(this.idleCheckTimer),this.idleCheckTimer=null)}async start(){if(this._isRunning)return this.log("Server is already running"),!0;let e=this.config.serverPort||3001,t=Ps();if(t!=="local"){this.log(`Container mode: ${t} \u2014 probing for container...`);let{useContainer:r,status:i}=await Jn();if(r&&i.detected)return this.log(`Container detected: MCP=${i.mcpHealthy}, Dashboard=${i.dashboardHealthy}`),this.logEvent("server_connected_container",{port:e,mcpPort:Dt(),mcpHealthy:i.mcpHealthy,dashboardHealthy:i.dashboardHealthy}),this._isRunning=!0,this._isExternalServer=!0,this._isContainerMode=!0,this.restartAttempts=0,this.updateStatusBar("container"),this.startContainerHealthMonitor(),$n("Connected to Project Memory container"),!0;if(t==="container")return this.log("Container mode forced but container not detected"),this.updateStatusBar("error"),ie.window.showWarningMessage('Project Memory: Container mode is set but no container was detected. Start the container with `run-container.ps1 run` or change containerMode to "auto".'),!1;this.log("No container detected \u2014 falling back to local server")}if(this.lockfile.isOwnedByOther()&&this.log("Another VS Code window owns the server \u2014 connecting as external"),this.log(`Checking if server already exists on port ${e}...`),await as(e))return this.log("Found existing server - connecting without spawning new process"),this.logEvent("server_connected_external",{port:e}),this._isRunning=!0,this._isExternalServer=!0,this.restartAttempts=0,this.updateStatusBar("connected"),$n("Connected to existing Project Memory server"),!0;let s=this.getServerDirectory();if(!s)return this.log("Dashboard server directory not found"),!1;this.log(`Starting server from: ${s}`),this._isExternalServer=!1,this.updateStatusBar("starting");try{let r={...process.env,PORT:String(this.config.serverPort||3001),WS_PORT:String(this.config.wsPort||3002),MBS_DATA_ROOT:this.config.dataRoot,MBS_AGENTS_ROOT:this.config.agentsRoot,MBS_PROMPTS_ROOT:this.config.promptsRoot||"",MBS_INSTRUCTIONS_ROOT:this.config.instructionsRoot||""},i=ri.join(s,"dist","index.js"),a=require("fs"),c,l;return a.existsSync(i)?(c="node",l=[i]):(c=process.platform==="win32"?"npx.cmd":"npx",l=["tsx","src/index.ts"]),this.serverProcess=(0,us.spawn)(c,l,{cwd:s,env:r,shell:!0,windowsHide:!0}),this.serverProcess.stdout?.on("data",d=>this.log(d.toString().trim())),this.serverProcess.stderr?.on("data",d=>this.log(`[stderr] ${d.toString().trim()}`)),this.serverProcess.on("error",d=>{this.log(`Server error: ${d.message}`),this._isRunning=!1,this.updateStatusBar("error")}),this.serverProcess.on("exit",(d,p)=>{this.log(`Server exited with code ${d}, signal ${p}`),this._isRunning=!1,this.serverProcess=null,this.ownedServerPid=null,this._intentionalStop?(this.log("Intentional stop - not auto-restarting"),this._intentionalStop=!1,this.updateStatusBar("stopped")):d!==0&&this.restartAttempts<this.maxRestartAttempts?(this.restartAttempts++,this.log(`Attempting restart (${this.restartAttempts}/${this.maxRestartAttempts})...`),setTimeout(()=>this.start(),2e3)):this.updateStatusBar("stopped")}),await Jr(e,1e4)?(this._isRunning=!0,this.restartAttempts=0,this.ownedServerPid=await cs(e),this.ownedServerPid&&this.log(`Server process id: ${this.ownedServerPid}`),this.updateStatusBar("running"),this.log("Server started successfully"),this.logEvent("server_spawned",{pid:this.ownedServerPid,port:e,serverDir:s}),this.lockfile.acquire(e),!0):(this.log("Server failed to start within timeout"),this.stop(),!1)}catch(r){return this.log(`Failed to start server: ${r}`),this.updateStatusBar("error"),!1}}async stop(){if(this._intentionalStop=!0,this.stopContainerHealthMonitor(),this._isExternalServer){this.log("Disconnecting from external server (not stopping it)"),this._intentionalStop=!1,this._isRunning=!1,this._isExternalServer=!1,this._isContainerMode=!1,this.updateStatusBar("stopped");return}if(!this.serverProcess&&this.ownedServerPid){this.log(`Stopping tracked server pid ${this.ownedServerPid}`),this.killPid(this.ownedServerPid),this.ownedServerPid=null,this._isRunning=!1,this.updateStatusBar("stopped");return}if(this.serverProcess)return this.log("Stopping server..."),this.updateStatusBar("stopping"),new Promise(e=>{if(!this.serverProcess){e();return}let t=setTimeout(()=>{this.serverProcess&&(this.log("Force killing server..."),this.serverProcess.kill("SIGKILL")),e()},5e3);this.serverProcess.on("exit",()=>{clearTimeout(t),this._isRunning=!1,this.serverProcess=null,this.ownedServerPid=null,this.updateStatusBar("stopped"),this.log("Server stopped"),this.logEvent("server_stopped",{pid:this.ownedServerPid}),this.lockfile.release(),e()}),process.platform==="win32"?(0,us.spawn)("taskkill",["/pid",String(this.serverProcess.pid),"/f","/t"],{windowsHide:!0}):this.serverProcess.kill("SIGTERM")})}async forceStopOwnedServer(){if(this._isExternalServer)return!1;this._intentionalStop=!0;let e=this.config.serverPort||3001,t=this.ownedServerPid||await cs(e);return t?(this.log(`Force stopping owned server on port ${e} (pid ${t})`),this.logEvent("server_force_kill",{pid:t,port:e,trigger:"forceStopOwnedServer"}),this.killPid(t),this.ownedServerPid=null,this._isRunning=!1,this.updateStatusBar("stopped"),!0):(this.log(`No owned server process found on port ${e}`),!1)}async forceStopExternalServer(){if(this.serverProcess&&!this._isExternalServer)return this.log("Server was started by this extension; use Stop Server instead"),!1;this._intentionalStop=!0;let e=this.config.serverPort||3001,t=await cs(e);return t?(this.log(`Force stopping server on port ${e} (pid ${t})`),this.logEvent("server_force_kill",{pid:t,port:e,trigger:"forceStopExternalServer"}),this.killPid(t),await new Promise(s=>setTimeout(s,1e3)),await as(e)?(this.log("Server still responding after force stop"),!1):(this._isRunning=!1,this._isExternalServer=!1,this.updateStatusBar("stopped"),this.log("External server stopped"),!0)):(this.log(`No process found listening on port ${e}`),!1)}async restart(){return await this.stop(),this.start()}async startFrontend(){return this.frontendManager.start()}async stopFrontend(){return this.frontendManager.stop()}updateConfig(e){this.config={...this.config,...e},this._isRunning&&this.restart()}hasServerDirectory(){return this.getServerDirectory()!==null}getServerDirectory(){return ei(e=>this.log(e))}async measureApiCall(e){return si(e,this._performanceStats)}updateStatusBar(e){let t={starting:"$(loading~spin)",running:"$(check)",connected:"$(plug)",container:"$(package)",stopping:"$(loading~spin)",stopped:"$(circle-slash)",error:"$(error)"},o={running:new ie.ThemeColor("statusBarItem.prominentBackground"),connected:new ie.ThemeColor("statusBarItem.prominentBackground"),container:new ie.ThemeColor("statusBarItem.prominentBackground"),error:new ie.ThemeColor("statusBarItem.errorBackground")},s={starting:"PM Server",running:"PM Server (local)",connected:"PM Server (shared)",container:"PM Server (container)",stopping:"PM Server",stopped:"PM Server",error:"PM Server"},r=this._isContainerMode?" (container)":this._isExternalServer?" (connected to existing)":"";this.statusBarItem.text=`${t[e]} ${s[e]||"PM Server"}`,this.statusBarItem.tooltip=`Project Memory Server: ${e}${r}
Click to toggle`,this.statusBarItem.backgroundColor=o[e],this.statusBarItem.show()}startContainerHealthMonitor(){this.stopContainerHealthMonitor(),this._containerHealthTimer=setInterval(async()=>{if(!this._isContainerMode||!this._isRunning)return;let e=Dt(),t=this.config.serverPort||3001;if(!(await Cs(e,t)).detected){this.log("Container health check failed \u2014 container unreachable"),this.logEvent("container_disconnected",{mcpPort:e,dashPort:t}),this._isRunning=!1,this._isExternalServer=!1,this._isContainerMode=!1,this.stopContainerHealthMonitor(),this.updateStatusBar("error");let s=await ie.window.showWarningMessage("Project Memory: Container connection lost. The container may have stopped.","Retry Container","Start Local","Dismiss");if(s==="Retry Container")this.start();else if(s==="Start Local"){this._isContainerMode=!1;let r=this.start.bind(this);this.log("Falling back to local server..."),await r()}}},3e4)}stopContainerHealthMonitor(){this._containerHealthTimer&&(clearInterval(this._containerHealthTimer),this._containerHealthTimer=null)}killPid(e){if(process.platform==="win32")(0,us.spawn)("taskkill",["/pid",String(e),"/f","/t"],{windowsHide:!0});else try{process.kill(e,"SIGKILL")}catch(t){this.log(`Failed to kill pid ${e}: ${t}`)}}log(e){let o=`[${new Date().toISOString()}] ${e}`;this.outputChannel.appendLine(o),Mn(this.config.dataRoot,"server-manager.log",o)}logEvent(e,t={}){this.log(`EVENT: ${e} ${JSON.stringify(t)}`),oi(this.config.dataRoot,e,t)}showLogs(){this.outputChannel.show()}dispose(){this.stopIdleMonitoring(),this.stopContainerHealthMonitor(),this.lockfile.release(),this.stop(),this.frontendManager.dispose(),this.outputChannel.dispose(),this.statusBarItem.dispose()}};var ii=P(require("vscode")),Y=P(require("fs")),ee=P(require("path")),fs=class{outputChannel;config;constructor(e){this.config=e,this.outputChannel=ii.window.createOutputChannel("Project Memory Deployment")}updateConfig(e){this.config={...this.config,...e}}async deployToWorkspace(e){let t=[],o=[];this.log(`Deploying defaults to workspace: ${e}`);let s=ee.join(e,".github","agents");for(let i of this.config.defaultAgents)try{await this.deployAgent(i,s)&&t.push(i)}catch(a){this.log(`Failed to deploy agent ${i}: ${a}`)}let r=ee.join(e,".github","instructions");for(let i of this.config.defaultInstructions)try{await this.deployInstruction(i,r)&&o.push(i)}catch(a){this.log(`Failed to deploy instruction ${i}: ${a}`)}return this.log(`Deployed ${t.length} agents, ${o.length} instructions`),{agents:t,instructions:o}}async deployAgent(e,t){let o=ee.join(this.config.agentsRoot,`${e}.agent.md`),s=ee.join(t,`${e}.agent.md`);return this.copyFile(o,s)}async deployInstruction(e,t){let o=ee.join(this.config.instructionsRoot,`${e}.instructions.md`),s=ee.join(t,`${e}.instructions.md`);return this.copyFile(o,s)}async updateWorkspace(e){let t=[],o=[],s=ee.join(e,".github","agents"),r=ee.join(e,".github","instructions");for(let i of this.config.defaultAgents){let a=ee.join(this.config.agentsRoot,`${i}.agent.md`),c=ee.join(s,`${i}.agent.md`);if(Y.existsSync(a))if(Y.existsSync(c)){let l=Y.statSync(a),u=Y.statSync(c);l.mtimeMs>u.mtimeMs&&(await this.copyFile(a,c,!0),t.push(i))}else await this.copyFile(a,c),o.push(i)}for(let i of this.config.defaultInstructions){let a=ee.join(this.config.instructionsRoot,`${i}.instructions.md`),c=ee.join(r,`${i}.instructions.md`);if(Y.existsSync(a))if(Y.existsSync(c)){let l=Y.statSync(a),u=Y.statSync(c);l.mtimeMs>u.mtimeMs&&(await this.copyFile(a,c,!0),t.push(i))}else await this.copyFile(a,c),o.push(i)}return{updated:t,added:o}}getDeploymentPlan(){let e=this.config.defaultAgents.filter(o=>{let s=ee.join(this.config.agentsRoot,`${o}.agent.md`);return Y.existsSync(s)}),t=this.config.defaultInstructions.filter(o=>{let s=ee.join(this.config.instructionsRoot,`${o}.instructions.md`);return Y.existsSync(s)});return{agents:e,instructions:t}}async copyFile(e,t,o=!1){if(!Y.existsSync(e))return this.log(`Source not found: ${e}`),!1;if(Y.existsSync(t)&&!o)return this.log(`Target exists, skipping: ${t}`),!1;let s=ee.dirname(t);return Y.existsSync(s)||Y.mkdirSync(s,{recursive:!0}),Y.copyFileSync(e,t),this.log(`Copied: ${e} -> ${t}`),!0}log(e){let t=new Date().toISOString();this.outputChannel.appendLine(`[${t}] ${e}`)}showLogs(){this.outputChannel.show()}dispose(){this.outputChannel.dispose()}};var et=P(require("vscode")),gs=P(require("http"));var Ct=class{connected=!1;serverPort=3001;serverHost="localhost";outputChannel;reconnectAttempts=0;maxReconnectAttempts=3;reconnectDelay=1e3;config;_onConnectionChange=new et.EventEmitter;onConnectionChange=this._onConnectionChange.event;constructor(e){this.config=e,this.outputChannel=et.window.createOutputChannel("Project Memory MCP Bridge");let t=et.workspace.getConfiguration("projectMemory");this.serverPort=t.get("serverPort")||3001}async connect(){if(this.connected){this.log("Already connected");return}try{let e=await this.httpGet("/api/health");if(e.status==="ok")this.connected=!0,this.reconnectAttempts=0,this._onConnectionChange.fire(!0),this.log(`Connected to shared server at localhost:${this.serverPort}`),this.log(`Data root: ${e.dataRoot}`);else throw new Error("Server health check failed")}catch(e){throw this.log(`Connection failed: ${e}`),this.connected=!1,this._onConnectionChange.fire(!1),new Error(`Could not connect to Project Memory server.
Please ensure the server is running (check PM Server status bar item).`)}}async disconnect(){this.connected&&(this.connected=!1,this._onConnectionChange.fire(!1),this.log("Disconnected from server"))}isConnected(){return this.connected}async reconnect(){this.connected=!1,this._onConnectionChange.fire(!1),await this.connect()}async callTool(e,t){if(!this.connected)throw new Error("Not connected to Project Memory server");this.log(`Calling tool: ${e} with args: ${JSON.stringify(t)}`);try{let o=await this.mapToolToHttp(e,t);return this.log(`Tool ${e} result: ${JSON.stringify(o).substring(0,200)}...`),o}catch(o){throw this.log(`Tool ${e} error: ${o}`),o}}async mapToolToHttp(e,t){switch(e){case"memory_workspace":return this.handleMemoryWorkspace(t);case"memory_plan":return this.handleMemoryPlan(t);case"memory_steps":return this.handleMemorySteps(t);case"memory_context":return this.handleMemoryContext(t);case"memory_agent":return this.handleMemoryAgent(t);case"register_workspace":return{workspace:{workspace_id:(await this.registerWorkspace(t.workspace_path)).workspace.workspace_id}};case"get_workspace_info":return this.handleMemoryWorkspace({action:"info",workspace_id:t.workspace_id});case"list_workspaces":return this.handleMemoryWorkspace({action:"list"});case"create_plan":return this.handleMemoryPlan({action:"create",workspace_id:t.workspace_id,title:t.title,description:t.description,category:t.category,priority:t.priority,goals:t.goals,success_criteria:t.success_criteria,template:t.template});case"get_plan_state":return this.handleMemoryPlan({action:"get",workspace_id:t.workspace_id,plan_id:t.plan_id});case"list_plans":return this.handleMemoryPlan({action:"list",workspace_id:t.workspace_id});case"update_step":return this.handleMemorySteps({action:"update",workspace_id:t.workspace_id,plan_id:t.plan_id,step_index:t.step_index??t.step_id,status:t.status,notes:t.notes});case"append_steps":return this.handleMemorySteps({action:"add",workspace_id:t.workspace_id,plan_id:t.plan_id,steps:t.steps});case"add_note":return this.handleMemoryPlan({action:"add_note",workspace_id:t.workspace_id,plan_id:t.plan_id,note:t.note,note_type:t.type||"info"});case"handoff":return this.handleMemoryAgent({action:"handoff",workspace_id:t.workspace_id,plan_id:t.plan_id,from_agent:t.from_agent,to_agent:t.to_agent??t.target_agent,reason:t.reason,summary:t.summary,artifacts:t.artifacts});case"get_lineage":return this.httpGet(`/api/plans/${t.workspace_id}/${t.plan_id}/lineage`);case"store_context":return this.handleMemoryContext({action:"store",workspace_id:t.workspace_id,plan_id:t.plan_id,type:t.type,data:t.data});case"get_context":return this.handleMemoryContext({action:"get",workspace_id:t.workspace_id,plan_id:t.plan_id,type:t.type});case"initialise_agent":return this.handleMemoryAgent({action:"init",...t});case"complete_agent":return this.handleMemoryAgent({action:"complete",...t});case"search":return this.httpGet(`/api/search?q=${encodeURIComponent(t.query)}`);default:throw new Error(`Unknown tool: ${e}`)}}async registerWorkspace(e){let t=fe(e),o=t?t.projectPath:e,r=(await this.httpGet("/api/workspaces")).workspaces.find(a=>a.path?.toLowerCase()===o.toLowerCase());return r?{workspace:{workspace_id:r.id}}:{workspace:{workspace_id:t?t.workspaceId:dt(o)}}}pathToWorkspaceId(e){let t=fe(e);return t?t.workspaceId:dt(e)}async listTools(){return[{name:"memory_workspace",description:"Workspace management (register, list, info, reindex)"},{name:"memory_plan",description:"Plan management (list, get, create, archive, add_note)"},{name:"memory_steps",description:"Step management (update, batch_update, add)"},{name:"memory_context",description:"Context management (store, get)"},{name:"memory_agent",description:"Agent lifecycle and handoffs"},{name:"register_workspace",description:"Register a workspace"},{name:"list_workspaces",description:"List all workspaces"},{name:"get_workspace_info",description:"Get workspace details"},{name:"create_plan",description:"Create a new plan"},{name:"get_plan_state",description:"Get plan state"},{name:"list_plans",description:"List plans for a workspace"},{name:"update_step",description:"Update a plan step"},{name:"append_steps",description:"Add steps to a plan"},{name:"add_note",description:"Add a note to a plan"},{name:"handoff",description:"Hand off between agents"},{name:"get_lineage",description:"Get handoff lineage"},{name:"store_context",description:"Store context data"},{name:"get_context",description:"Get context data"},{name:"initialise_agent",description:"Initialize an agent session"},{name:"complete_agent",description:"Complete an agent session"},{name:"search",description:"Search across workspaces"}]}async handleMemoryWorkspace(e){let t=e.action;switch(t){case"register":return{workspace_id:(await this.registerWorkspace(e.workspace_path)).workspace.workspace_id};case"list":return this.httpGet("/api/workspaces");case"info":return this.httpGet(`/api/workspaces/${e.workspace_id}`);case"reindex":throw new Error("Workspace reindex is not available via the HTTP bridge.");default:throw new Error(`Unknown memory_workspace action: ${t}`)}}async handleMemoryPlan(e){let t=e.action,o=e.workspace_id,s=e.plan_id;if(!o)throw new Error("workspace_id is required");switch(t){case"list":{let r=await this.httpGet(`/api/plans/workspace/${o}`);return{active_plans:this.normalizePlanSummaries(r.plans||[]),total:r.total}}case"get":{if(!s)throw new Error("plan_id is required");let r=await this.httpGet(`/api/plans/${o}/${s}`);return this.normalizePlanState(r)}case"create":{let r=e.title,i=e.description;if(!r||!i)throw new Error("title and description are required");let a=e.template,c={title:r,description:i,category:e.category||"feature",priority:e.priority||"medium",goals:e.goals,success_criteria:e.success_criteria},l=a?await this.httpPost(`/api/plans/${o}/template`,{...c,template:a}):await this.httpPost(`/api/plans/${o}`,c);if(l&&typeof l=="object"&&"plan"in l){let u=l;if(u.plan)return this.normalizePlanState(u.plan)}return this.normalizePlanState(l)}case"archive":{if(!s)throw new Error("plan_id is required");return this.httpPost(`/api/plans/${o}/${s}/archive`,{})}case"add_note":{if(!s)throw new Error("plan_id is required");return this.httpPost(`/api/plans/${o}/${s}/notes`,{note:e.note,type:e.note_type||"info"})}default:throw new Error(`Unknown memory_plan action: ${t}`)}}async handleMemorySteps(e){let t=e.action,o=e.workspace_id,s=e.plan_id;if(!o||!s)throw new Error("workspace_id and plan_id are required");let r=await this.getPlanState(o,s),i=Array.isArray(r.steps)?[...r.steps]:[];switch(t){case"update":{let a=this.toStepIndex(e.step_index);if(a===null)throw new Error("step_index is required");if(!i[a])throw new Error(`Step index out of range: ${a}`);return e.status&&(i[a].status=e.status),e.notes&&(i[a].notes=e.notes),this.updatePlanSteps(o,s,i)}case"batch_update":{let a=e.updates;if(!a||a.length===0)throw new Error("updates array is required");for(let c of a){let l=this.toStepIndex(c.step_index);if(l===null||!i[l])throw new Error(`Step index out of range: ${c.step_index}`);c.status&&(i[l].status=c.status),c.notes&&(i[l].notes=c.notes)}return this.updatePlanSteps(o,s,i)}case"add":{let a=e.steps||[];if(a.length===0)throw new Error("steps array is required");let c=i.length,l=a.map((d,p)=>({index:c+p,phase:d.phase,task:d.task,status:d.status||"pending",type:d.type,assignee:d.assignee,requires_validation:d.requires_validation,notes:d.notes})),u=i.concat(l);return this.updatePlanSteps(o,s,u)}default:throw new Error(`Unknown memory_steps action: ${t}`)}}async handleMemoryContext(e){let t=e.action,o=e.workspace_id,s=e.plan_id;if(!o||!s)throw new Error("workspace_id and plan_id are required");switch(t){case"store":return this.httpPost(`/api/plans/${o}/${s}/context`,{type:e.type,data:e.data});case"get":{if(!e.type)throw new Error("type is required for context get");return this.httpGet(`/api/plans/${o}/${s}/context/${e.type}`)}case"store_initial":return this.httpPost(`/api/plans/${o}/${s}/context/initial`,{user_request:e.user_request,files_mentioned:e.files_mentioned,file_contents:e.file_contents,requirements:e.requirements,constraints:e.constraints,examples:e.examples,conversation_context:e.conversation_context,additional_notes:e.additional_notes});case"list":return(await this.httpGet(`/api/plans/${o}/${s}/context`)).context||[];case"list_research":return(await this.httpGet(`/api/plans/${o}/${s}/context/research`)).notes||[];case"append_research":return this.httpPost(`/api/plans/${o}/${s}/research`,{filename:e.filename,content:e.content});case"batch_store":{let r=Array.isArray(e.items)?e.items:[];if(r.length===0)throw new Error("items array is required for batch_store");let i=[];for(let a of r){let c=await this.httpPost(`/api/plans/${o}/${s}/context`,{type:a.type,data:a.data});i.push({type:a.type,result:c})}return{stored:i}}case"generate_instructions":throw new Error("generate_instructions is not available via the HTTP bridge.");default:throw new Error(`Unknown memory_context action: ${t}`)}}async handleMemoryAgent(e){let t=e.action,o=e.workspace_id,s=e.plan_id;switch(t){case"get_briefing":{if(!o||!s)throw new Error("workspace_id and plan_id are required");let r=await this.getPlanState(o,s),i=await this.httpGet(`/api/plans/${o}/${s}/lineage`);return{plan:this.normalizePlanState(r),lineage:i}}case"handoff":{if(!o||!s)throw new Error("workspace_id and plan_id are required");let r=e.to_agent||e.target_agent;if(!r)throw new Error("to_agent is required");let i=e.summary||e.reason||"Handoff requested";return this.httpPost(`/api/plans/${o}/${s}/handoff`,{from_agent:e.from_agent||e.agent_type||"Unknown",to_agent:r,reason:e.reason||i,summary:i,artifacts:e.artifacts})}case"init":case"complete":throw new Error("Agent sessions are not available via the HTTP bridge.");default:throw new Error(`Unknown memory_agent action: ${t}`)}}async getPlanState(e,t){let o=await this.httpGet(`/api/plans/${e}/${t}`);return this.normalizePlanState(o)}async updatePlanSteps(e,t,o){return this.httpPut(`/api/plans/${e}/${t}/steps`,{steps:o})}normalizePlanState(e){if(!e||typeof e!="object")return e;let t=e;return!t.plan_id&&typeof t.id=="string"&&(t.plan_id=t.id),Array.isArray(t.steps)&&(t.steps=t.steps.map((o,s)=>({index:typeof o.index=="number"?o.index:s,...o}))),t}normalizePlanSummaries(e){return e.map(t=>this.normalizePlanState(t))}toStepIndex(e){if(typeof e=="number"&&Number.isFinite(e))return e;if(typeof e=="string"&&e.trim().length>0){let t=Number(e);if(Number.isFinite(t))return t}return null}showLogs(){this.outputChannel.show()}dispose(){this.disconnect(),this._onConnectionChange.dispose(),this.outputChannel.dispose()}log(e){let t=new Date().toISOString();this.outputChannel.appendLine(`[${t}] ${e}`),console.log(`[MCP Bridge] ${e}`)}httpGet(e){return new Promise((t,o)=>{let s=`http://${this.serverHost}:${this.serverPort}${e}`;this.log(`GET ${s}`);let r=gs.get(s,i=>{let a="";i.on("data",c=>a+=c),i.on("end",()=>{try{if(i.statusCode&&i.statusCode>=400){o(new Error(`HTTP ${i.statusCode}: ${a}`));return}let c=JSON.parse(a);t(c)}catch{o(new Error(`Failed to parse response: ${a}`))}})});r.on("error",o),r.setTimeout(1e4,()=>{r.destroy(),o(new Error("Request timeout"))})})}httpPost(e,t){return this.httpRequest("POST",e,t)}httpPut(e,t){return this.httpRequest("PUT",e,t)}httpRequest(e,t,o){return new Promise((s,r)=>{let i=JSON.stringify(o),a=`http://${this.serverHost}:${this.serverPort}${t}`;this.log(`${e} ${a}`);let c={hostname:this.serverHost,port:this.serverPort,path:t,method:e,headers:{"Content-Type":"application/json","Content-Length":Buffer.byteLength(i)}},l=gs.request(c,u=>{let d="";u.on("data",p=>d+=p),u.on("end",()=>{try{if(u.statusCode&&u.statusCode>=400){r(new Error(`HTTP ${u.statusCode}: ${d}`));return}let p=JSON.parse(d);s(p)}catch{r(new Error(`Failed to parse response: ${d}`))}})});l.on("error",r),l.setTimeout(1e4,()=>{l.destroy(),r(new Error("Request timeout"))}),l.write(i),l.end()})}};var Te=P(require("vscode"));var Pt=class{participant;mcpBridge;workspaceId=null;constructor(e){this.mcpBridge=e,this.participant=Te.chat.createChatParticipant("project-memory.memory",this.handleRequest.bind(this)),this.participant.iconPath=new Te.ThemeIcon("book"),this.participant.followupProvider={provideFollowups:this.provideFollowups.bind(this)}}async handleRequest(e,t,o,s){if(!this.mcpBridge.isConnected())return o.markdown(`\u26A0\uFE0F **Not connected to MCP server**

Use the "Project Memory: Reconnect Chat to MCP Server" command to reconnect.`),{metadata:{command:"error"}};await this.ensureWorkspaceRegistered(o);try{switch(e.command){case"plan":return await this.handlePlanCommand(e,o,s);case"context":return await this.handleContextCommand(e,o,s);case"handoff":return await this.handleHandoffCommand(e,o,s);case"status":return await this.handleStatusCommand(e,o,s);case"deploy":return await this.handleDeployCommand(e,o,s);case"diagnostics":return await this.handleDiagnosticsCommand(e,o,s);default:return await this.handleDefaultCommand(e,o,s)}}catch(r){let i=r instanceof Error?r.message:String(r);return o.markdown(`\u274C **Error**: ${i}`),{metadata:{command:"error"}}}}async ensureWorkspaceRegistered(e){if(this.workspaceId)return;let t=Te.workspace.workspaceFolders?.[0];if(!t){e.markdown(`\u26A0\uFE0F No workspace folder open. Please open a folder first.
`);return}if(!this.mcpBridge.isConnected()){e.markdown(`\u26A0\uFE0F MCP server not connected. Click the MCP status bar item to reconnect.
`);return}try{let o=fe(t.uri.fsPath),s=o?o.projectPath:t.uri.fsPath;console.log(`Registering workspace: ${s}`+(o?" (resolved from identity)":""));let r=await this.mcpBridge.callTool("memory_workspace",{action:"register",workspace_path:s});console.log(`Register workspace result: ${JSON.stringify(r)}`),r.workspace_id?(this.workspaceId=r.workspace_id,console.log(`Workspace registered: ${this.workspaceId}`)):(console.error("Unexpected response format:",r),e.markdown(`\u26A0\uFE0F Unexpected response from MCP server. Check console for details.
`))}catch(o){let s=o instanceof Error?o.message:String(o);console.error("Failed to register workspace:",o),e.markdown(`\u26A0\uFE0F Failed to register workspace: ${s}
`)}}async handlePlanCommand(e,t,o){let s=e.prompt.trim();if(!s||s==="list")return await this.listPlans(t);if(s.startsWith("create "))return await this.createPlan(s.substring(7),t);if(s.startsWith("show ")){let r=s.substring(5).trim();return await this.showPlan(r,t)}return t.markdown(`\u{1F4CB} **Plan Commands**

`),t.markdown("- `/plan list` - List all plans in this workspace\n"),t.markdown("- `/plan create <title>` - Create a new plan\n"),t.markdown("- `/plan show <plan-id>` - Show plan details\n"),t.markdown(`
Or just describe what you want to do and I'll help create a plan.`),{metadata:{command:"plan"}}}async listPlans(e){if(!this.workspaceId)return e.markdown("\u26A0\uFE0F Workspace not registered."),{metadata:{command:"plan"}};e.progress("Fetching plans...");let o=(await this.mcpBridge.callTool("memory_plan",{action:"list",workspace_id:this.workspaceId})).active_plans||[];if(o.length===0)return e.markdown("\u{1F4CB} **No plans found**\n\nUse `/plan create <title>` to create a new plan."),{metadata:{command:"plan"}};e.markdown(`\u{1F4CB} **Plans in this workspace** (${o.length})

`);for(let s of o){let r=this.getStatusEmoji(s.status),i=s.plan_id||s.id||"unknown";e.markdown(`${r} **${s.title}** \`${i}\`
`),s.category&&e.markdown(`   Category: ${s.category}
`)}return{metadata:{command:"plan",plans:o.length}}}async createPlan(e,t){if(!this.workspaceId)return t.markdown("\u26A0\uFE0F Workspace not registered."),{metadata:{command:"plan"}};t.markdown(`\u{1F504} Creating plan: **${e}**...

`);let o=await this.mcpBridge.callTool("memory_plan",{action:"create",workspace_id:this.workspaceId,title:e,description:e,category:"feature"}),s=o.plan_id||o.id||"unknown";return t.markdown(`\u2705 **Plan created!**

`),t.markdown(`- **ID**: \`${s}\`
`),t.markdown(`- **Title**: ${o.title}
`),t.markdown(`
Use \`/plan show ${s}\` to see details.`),{metadata:{command:"plan",action:"created",planId:s}}}async showPlan(e,t){if(!this.workspaceId)return t.markdown("\u26A0\uFE0F Workspace not registered."),{metadata:{command:"plan"}};let o=await this.mcpBridge.callTool("memory_plan",{action:"get",workspace_id:this.workspaceId,plan_id:e}),s=o.plan_id||o.id||e;if(t.markdown(`# \u{1F4CB} ${o.title}

`),t.markdown(`**ID**: \`${s}\`
`),o.category&&t.markdown(`**Category**: ${o.category}
`),o.priority&&t.markdown(`**Priority**: ${o.priority}
`),o.description&&t.markdown(`
${o.description}
`),o.steps&&o.steps.length>0){t.markdown(`
## Steps

`);for(let r=0;r<o.steps.length;r++){let i=o.steps[r],a=this.getStepStatusEmoji(i.status);t.markdown(`${a} **${i.phase}**: ${i.task}
`)}}if(o.lineage&&o.lineage.length>0){t.markdown(`
## Agent History

`);for(let r of o.lineage)t.markdown(`- **${r.agent_type}** (${r.started_at})
`),r.summary&&t.markdown(`  ${r.summary}
`)}return{metadata:{command:"plan",action:"show",planId:e}}}async handleContextCommand(e,t,o){if(!this.workspaceId)return t.markdown("\u26A0\uFE0F Workspace not registered."),{metadata:{command:"context"}};t.markdown(`\u{1F50D} **Gathering workspace context...**

`),t.progress("Querying workspace info...");try{let s=await this.mcpBridge.callTool("memory_workspace",{action:"info",workspace_id:this.workspaceId});if(t.markdown(`## Workspace Information

`),t.markdown(`**ID**: \`${s.workspace_id}\`
`),t.markdown(`**Path**: \`${s.workspace_path}\`
`),s.codebase_profile){let r=s.codebase_profile;t.markdown(`
## Codebase Profile

`),r.languages&&r.languages.length>0&&t.markdown(`**Languages**: ${r.languages.join(", ")}
`),r.frameworks&&r.frameworks.length>0&&t.markdown(`**Frameworks**: ${r.frameworks.join(", ")}
`),r.file_count&&t.markdown(`**Files**: ${r.file_count}
`)}}catch{t.markdown(`\u26A0\uFE0F Could not retrieve full context. Basic workspace info:

`),t.markdown(`**Workspace ID**: \`${this.workspaceId}\`
`)}return{metadata:{command:"context"}}}async handleHandoffCommand(e,t,o){let s=e.prompt.trim();if(!s)return t.markdown(`\u{1F91D} **Handoff Command**

`),t.markdown("Usage: `/handoff <agent-type> <plan-id> [summary]`\n\n"),t.markdown(`**Available agents:**
`),t.markdown("- `Coordinator` - Orchestrates the workflow\n"),t.markdown("- `Researcher` - Gathers external information\n"),t.markdown("- `Architect` - Creates implementation plans\n"),t.markdown("- `Executor` - Implements the plan\n"),t.markdown("- `Reviewer` - Validates completed work\n"),t.markdown("- `Tester` - Writes and runs tests\n"),t.markdown("- `Archivist` - Finalizes and archives\n"),t.markdown("- `Analyst` - Deep investigation and analysis\n"),t.markdown("- `Brainstorm` - Explore and refine ideas\n"),t.markdown("- `Runner` - Quick tasks and exploration\n"),t.markdown("- `Builder` - Build verification and diagnostics\n"),{metadata:{command:"handoff"}};let r=s.split(" ");if(r.length<2)return t.markdown(`\u26A0\uFE0F Please provide both agent type and plan ID.
`),t.markdown("Example: `/handoff Executor plan_abc123`"),{metadata:{command:"handoff"}};let i=r[0],a=r[1],c=r.slice(2).join(" ")||"Handoff from chat";if(!this.workspaceId)return t.markdown("\u26A0\uFE0F Workspace not registered."),{metadata:{command:"handoff"}};t.markdown(`\u{1F504} Initiating handoff to **${i}**...

`);try{let l=await this.mcpBridge.callTool("memory_agent",{action:"handoff",workspace_id:this.workspaceId,plan_id:a,from_agent:"User",to_agent:i,summary:c});t.markdown(`\u2705 **Handoff recorded!**

`),t.markdown(`Plan \`${a}\` handoff to **${i}** has been recorded.
`),l?.warning&&t.markdown(`
\u26A0\uFE0F ${l.warning}
`)}catch(l){let u=l instanceof Error?l.message:String(l);t.markdown(`\u274C Handoff failed: ${u}`)}return{metadata:{command:"handoff",targetAgent:i,planId:a}}}async handleStatusCommand(e,t,o){if(!this.workspaceId)return t.markdown("\u26A0\uFE0F Workspace not registered."),{metadata:{command:"status"}};t.markdown(`\u{1F4CA} **Project Memory Status**

`),t.progress("Checking MCP connection...");let s=this.mcpBridge.isConnected();t.markdown(`**MCP Server**: ${s?"\u{1F7E2} Connected":"\u{1F534} Disconnected"}
`),t.markdown(`**Workspace ID**: \`${this.workspaceId}\`

`),t.progress("Fetching plans...");try{let a=((await this.mcpBridge.callTool("memory_plan",{action:"list",workspace_id:this.workspaceId})).active_plans||[]).filter(c=>c.status!=="archived");if(t.markdown(`## Active Plans (${a.length})

`),a.length===0)t.markdown(`No active plans.
`);else for(let c of a){let l=this.getStatusEmoji(c.status),u=c.done_steps??c.progress?.done??0,d=c.total_steps??c.progress?.total??0,p=c.plan_id||c.id;t.markdown(`${l} **${c.title}**${p?` (\`${p}\`)`:""}
`),d>0&&t.markdown(`   Progress: ${u}/${d} steps
`)}}catch{t.markdown(`Could not retrieve plan status.
`)}return{metadata:{command:"status"}}}async handleDeployCommand(e,t,o){let s=e.prompt.trim().toLowerCase();if(!s)return t.markdown(`\u{1F680} **Deploy Command**

`),t.markdown("Usage: `/deploy <target>`\n\n"),t.markdown(`**Targets:**
`),t.markdown("- `agents` \u2014 Copy agent files to the open workspace\n"),t.markdown("- `prompts` \u2014 Copy prompt files to the open workspace\n"),t.markdown("- `instructions` \u2014 Copy instruction files to the open workspace\n"),t.markdown("- `all` \u2014 Deploy agents, prompts, and instructions\n"),{metadata:{command:"deploy"}};let i={agents:"projectMemory.deployAgents",prompts:"projectMemory.deployPrompts",instructions:"projectMemory.deployInstructions",all:"projectMemory.deployCopilotConfig"}[s];if(!i)return t.markdown(`\u26A0\uFE0F Unknown deploy target: **${s}**

Use: agents, prompts, instructions, or all`),{metadata:{command:"deploy"}};t.markdown(`\u{1F680} Running **deploy ${s}**...
`);try{await Te.commands.executeCommand(i),t.markdown(`
\u2705 Deploy ${s} command executed.`)}catch(a){let c=a instanceof Error?a.message:String(a);t.markdown(`
\u274C Deploy failed: ${c}`)}return{metadata:{command:"deploy",target:s}}}async handleDiagnosticsCommand(e,t,o){t.markdown(`\u{1F50D} **Running diagnostics...**

`);try{if(await Te.commands.executeCommand("projectMemory.showDiagnostics"),t.markdown(`\u2705 Diagnostics report written to the **Project Memory Diagnostics** output channel.

`),this.mcpBridge.isConnected())try{let s=Date.now(),r=await this.mcpBridge.callTool("memory_workspace",{action:"list"}),i=Date.now()-s,a=Array.isArray(r.workspaces)?r.workspaces.length:0;t.markdown(`## Quick Summary

`),t.markdown(`| Metric | Value |
|--------|-------|
`),t.markdown(`| MCP Connection | \u{1F7E2} Connected |
`),t.markdown(`| MCP Response Time | ${i}ms |
`),t.markdown(`| Workspaces | ${a} |
`),t.markdown(`| Memory | ${(process.memoryUsage().heapUsed/1024/1024).toFixed(1)} MB |
`)}catch{t.markdown(`\u26A0\uFE0F Could not probe MCP server for summary.
`)}else t.markdown(`\u26A0\uFE0F MCP server is **not connected**. Some diagnostics may be incomplete.
`)}catch(s){let r=s instanceof Error?s.message:String(s);t.markdown(`\u274C Diagnostics failed: ${r}`)}return{metadata:{command:"diagnostics"}}}async handleDefaultCommand(e,t,o){let s=e.prompt.trim();if(!s)return t.markdown(`\u{1F44B} **Welcome to Project Memory!**

`),t.markdown(`I can help you manage project plans and agent workflows.

`),t.markdown(`**Available commands:**
`),t.markdown("- `/plan` - View, create, or manage plans\n"),t.markdown("- `/context` - Get workspace context and codebase profile\n"),t.markdown("- `/handoff` - Execute agent handoffs\n"),t.markdown("- `/status` - Show current plan progress\n"),t.markdown("- `/deploy` - Deploy agents, prompts, or instructions\n"),t.markdown("- `/diagnostics` - Run system health diagnostics\n"),t.markdown(`
Or just ask me about your project!`),{metadata:{command:"help"}};if(s.toLowerCase().includes("plan")||s.toLowerCase().includes("create"))t.markdown(`I can help you with plans!

`),t.markdown("Try using the `/plan` command:\n"),t.markdown("- `/plan list` to see existing plans\n"),t.markdown(`- \`/plan create ${s}\` to create a new plan
`);else{if(s.toLowerCase().includes("status")||s.toLowerCase().includes("progress"))return await this.handleStatusCommand(e,t,o);t.markdown(`I understand you want to: **${s}**

`),t.markdown(`Here's what I can help with:
`),t.markdown(`- Use \`/plan create ${s}\` to create a plan for this
`),t.markdown("- Use `/status` to check current progress\n"),t.markdown("- Use `/context` to get workspace information\n")}return{metadata:{command:"default"}}}provideFollowups(e,t,o){let s=e.metadata,r=s?.command,i=[];switch(r){case"plan":s?.action==="created"&&s?.planId&&i.push({prompt:`/plan show ${s.planId}`,label:"View plan details",command:"plan"}),i.push({prompt:"/status",label:"Check status",command:"status"});break;case"status":i.push({prompt:"/plan list",label:"List all plans",command:"plan"});break;case"help":case"default":i.push({prompt:"/plan list",label:"List plans",command:"plan"}),i.push({prompt:"/status",label:"Check status",command:"status"}),i.push({prompt:"/diagnostics",label:"Run diagnostics",command:"diagnostics"});break}return i}getStatusEmoji(e){switch(e){case"active":return"\u{1F535}";case"completed":return"\u2705";case"archived":return"\u{1F4E6}";case"blocked":return"\u{1F534}";default:return"\u26AA"}}getStepStatusEmoji(e){switch(e){case"done":return"\u2705";case"active":return"\u{1F504}";case"blocked":return"\u{1F534}";default:return"\u2B1C"}}resetWorkspace(){this.workspaceId=null}dispose(){this.participant.dispose()}};var Fe=P(require("vscode"));var $e=P(require("vscode"));async function Dn(n,e,t){try{if(!t.mcpBridge.isConnected())return ms("MCP server not connected");let{action:o,workspacePath:s,workspaceId:r}=n.input,i;switch(o){case"register":{let a=s??$e.workspace.workspaceFolders?.[0]?.uri.fsPath;if(!a)return ms("No workspace path provided and no workspace folder open");let c=await t.mcpBridge.callTool("memory_workspace",{action:"register",workspace_path:a});t.setWorkspaceId(c.workspace_id),i=c;break}case"list":i=await t.mcpBridge.callTool("memory_workspace",{action:"list"});break;case"info":{let a=r??await t.ensureWorkspace();i=await t.mcpBridge.callTool("memory_workspace",{action:"info",workspace_id:a});break}case"reindex":{let a=r??await t.ensureWorkspace();i=await t.mcpBridge.callTool("memory_workspace",{action:"reindex",workspace_id:a});break}default:return ms(`Unknown action: ${o}`)}return new $e.LanguageModelToolResult([new $e.LanguageModelTextPart(JSON.stringify(i,null,2))])}catch(o){return ms(o)}}function ms(n){let e=n instanceof Error?n.message:String(n);return new $e.LanguageModelToolResult([new $e.LanguageModelTextPart(JSON.stringify({success:!1,error:e}))])}var tt=P(require("vscode"));async function Fn(n,e,t){try{if(!t.mcpBridge.isConnected())return De("MCP server not connected");let o=await t.ensureWorkspace(),{action:s,planId:r,agentType:i,fromAgent:a,toAgent:c,reason:l,summary:u,artifacts:d,taskDescription:p}=n.input,h;switch(s){case"init":{if(!r||!i)return De("planId and agentType are required for init");h=await t.mcpBridge.callTool("memory_agent",{action:"init",workspace_id:o,plan_id:r,agent_type:i,task_description:p});break}case"complete":{if(!r||!i)return De("planId and agentType are required for complete");h=await t.mcpBridge.callTool("memory_agent",{action:"complete",workspace_id:o,plan_id:r,agent_type:i,summary:u,artifacts:d});break}case"handoff":{if(!r||!c)return De("planId and toAgent are required for handoff");h=await t.mcpBridge.callTool("memory_agent",{action:"handoff",workspace_id:o,plan_id:r,from_agent:a||"User",to_agent:c,reason:l||u||"Handoff via chat tool",summary:u,artifacts:d});break}case"validate":{if(!i)return De("agentType is required for validate");h=await t.mcpBridge.callTool("memory_agent",{action:"validate",workspace_id:o,plan_id:r,agent_type:i,task_description:p});break}case"list":{h=await t.mcpBridge.callTool("memory_agent",{action:"list",workspace_id:o,plan_id:r});break}case"get_instructions":{if(!i)return De("agentType is required for get_instructions");h=await t.mcpBridge.callTool("memory_agent",{action:"get_instructions",workspace_id:o,agent_type:i});break}default:return De(`Unknown action: ${s}`)}return new tt.LanguageModelToolResult([new tt.LanguageModelTextPart(JSON.stringify(h,null,2))])}catch(o){return De(o)}}function De(n){let e=n instanceof Error?n.message:String(n);return new tt.LanguageModelToolResult([new tt.LanguageModelTextPart(JSON.stringify({success:!1,error:e}))])}var st=P(require("vscode"));async function Ln(n,e,t){try{if(!t.mcpBridge.isConnected())return me("MCP server not connected");let o=await t.ensureWorkspace(),s=n.input,r;switch(s.action){case"list":{let a=(await t.mcpBridge.callTool("memory_plan",{action:"list",workspace_id:o,include_archived:s.includeArchived})).active_plans||[];r={workspace_id:o,plans:a,total:a.length,message:a.length>0?`Found ${a.length} plan(s)`:'No plans found. Use action "create" to create one.'};break}case"get":{if(!s.planId)return me("planId is required for get");r=await t.mcpBridge.callTool("memory_plan",{action:"get",workspace_id:o,plan_id:s.planId});break}case"create":{if(!s.title||!s.description)return me("title and description are required for create");r=await t.mcpBridge.callTool("memory_plan",{action:"create",workspace_id:o,title:s.title,description:s.description,category:s.category||"feature",priority:s.priority||"medium",template:s.template,goals:s.goals,success_criteria:s.success_criteria});break}case"archive":{if(!s.planId)return me("planId is required for archive");r=await t.mcpBridge.callTool("memory_plan",{action:"archive",workspace_id:o,plan_id:s.planId});break}case"update":{if(!s.planId)return me("planId is required for update");r=await t.mcpBridge.callTool("memory_plan",{action:"update",workspace_id:o,plan_id:s.planId,steps:s.steps});break}case"find":{if(!s.planId)return me("planId is required for find");r=await t.mcpBridge.callTool("memory_plan",{action:"find",workspace_id:o,plan_id:s.planId});break}case"set_goals":{if(!s.planId)return me("planId is required for set_goals");r=await t.mcpBridge.callTool("memory_plan",{action:"set_goals",workspace_id:o,plan_id:s.planId,goals:s.goals,success_criteria:s.success_criteria});break}case"add_build_script":{if(!s.planId||!s.scriptName||!s.scriptCommand)return me("planId, scriptName, scriptCommand are required");r=await t.mcpBridge.callTool("memory_plan",{action:"add_build_script",workspace_id:o,plan_id:s.planId,script_name:s.scriptName,script_command:s.scriptCommand,script_description:s.scriptDescription,script_directory:s.scriptDirectory});break}case"delete_build_script":{if(!s.planId||!s.scriptId)return me("planId and scriptId are required");r=await t.mcpBridge.callTool("memory_plan",{action:"delete_build_script",workspace_id:o,plan_id:s.planId,script_id:s.scriptId});break}case"add_note":{if(!s.planId||!s.note)return me("planId and note are required for add_note");r=await t.mcpBridge.callTool("memory_plan",{action:"add_note",workspace_id:o,plan_id:s.planId,note:s.note,note_type:s.noteType||"info"});break}default:return me(`Unknown action: ${s.action}`)}return new st.LanguageModelToolResult([new st.LanguageModelTextPart(JSON.stringify(r,null,2))])}catch(o){return me(o)}}function me(n){let e=n instanceof Error?n.message:String(n);return new st.LanguageModelToolResult([new st.LanguageModelTextPart(JSON.stringify({success:!1,error:e}))])}var nt=P(require("vscode"));async function Bn(n,e,t){try{if(!t.mcpBridge.isConnected())return we("MCP server not connected");let o=await t.ensureWorkspace(),s=n.input;if(!s.planId)return we("planId is required");let r;switch(s.action){case"update":{if(s.stepIndex===void 0||!s.status)return we("stepIndex and status are required for update");r=await t.mcpBridge.callTool("memory_steps",{action:"update",workspace_id:o,plan_id:s.planId,step_index:s.stepIndex,status:s.status,notes:s.notes});break}case"batch_update":{if(!s.updates||s.updates.length===0)return we("updates array is required for batch_update");r=await t.mcpBridge.callTool("memory_steps",{action:"batch_update",workspace_id:o,plan_id:s.planId,updates:s.updates});break}case"add":{if(!s.newSteps||s.newSteps.length===0)return we("newSteps array is required for add");r=await t.mcpBridge.callTool("memory_steps",{action:"add",workspace_id:o,plan_id:s.planId,steps:s.newSteps.map(i=>({...i,status:i.status||"pending"}))});break}case"insert":{if(s.atIndex===void 0||!s.step)return we("atIndex and step are required for insert");r=await t.mcpBridge.callTool("memory_steps",{action:"insert",workspace_id:o,plan_id:s.planId,at_index:s.atIndex,step:{...s.step,status:s.step.status||"pending"}});break}case"delete":{if(s.stepIndex===void 0)return we("stepIndex is required for delete");r=await t.mcpBridge.callTool("memory_steps",{action:"delete",workspace_id:o,plan_id:s.planId,step_index:s.stepIndex});break}case"reorder":{if(s.stepIndex===void 0||!s.direction)return we("stepIndex and direction are required for reorder");r=await t.mcpBridge.callTool("memory_steps",{action:"reorder",workspace_id:o,plan_id:s.planId,step_index:s.stepIndex,direction:s.direction});break}case"move":{if(s.fromIndex===void 0||s.toIndex===void 0)return we("fromIndex and toIndex are required for move");r=await t.mcpBridge.callTool("memory_steps",{action:"move",workspace_id:o,plan_id:s.planId,from_index:s.fromIndex,to_index:s.toIndex});break}case"replace":{if(!s.replacementSteps)return we("replacementSteps array is required for replace");r=await t.mcpBridge.callTool("memory_steps",{action:"replace",workspace_id:o,plan_id:s.planId,replacement_steps:s.replacementSteps.map(i=>({...i,status:i.status||"pending"}))});break}default:return we(`Unknown action: ${s.action}`)}return new nt.LanguageModelToolResult([new nt.LanguageModelTextPart(JSON.stringify(r,null,2))])}catch(o){return we(o)}}function we(n){let e=n instanceof Error?n.message:String(n);return new nt.LanguageModelToolResult([new nt.LanguageModelTextPart(JSON.stringify({success:!1,error:e}))])}var ot=P(require("vscode"));async function Hn(n,e,t){try{if(!t.mcpBridge.isConnected())return le("MCP server not connected");let o=await t.ensureWorkspace(),s=n.input,r;switch(s.action){case"add_note":{if(!s.planId||!s.note)return le("planId and note are required for add_note");r=await t.mcpBridge.callTool("memory_plan",{action:"add_note",workspace_id:o,plan_id:s.planId,note:s.note,note_type:s.noteType||"info"});break}case"briefing":{if(!s.planId)return le("planId is required for briefing");r=await t.mcpBridge.callTool("memory_agent",{action:"get_briefing",workspace_id:o,plan_id:s.planId});break}case"handoff":{if(!s.planId||!s.targetAgent||!s.reason)return le("planId, targetAgent, and reason are required for handoff");r=await t.mcpBridge.callTool("memory_agent",{action:"handoff",workspace_id:o,plan_id:s.planId,from_agent:"User",to_agent:s.targetAgent,reason:s.reason});break}case"workspace":{r=await t.mcpBridge.callTool("memory_workspace",{action:"info",workspace_id:o});break}case"store":{if(!s.planId||!s.type||!s.data)return le("planId, type, and data are required for store");r=await t.mcpBridge.callTool("memory_context",{action:"store",workspace_id:o,plan_id:s.planId,type:s.type,data:s.data});break}case"get":{if(!s.planId||!s.type)return le("planId and type are required for get");r=await t.mcpBridge.callTool("memory_context",{action:"get",workspace_id:o,plan_id:s.planId,type:s.type});break}case"store_initial":{if(!s.planId||!s.userRequest)return le("planId and userRequest are required for store_initial");r=await t.mcpBridge.callTool("memory_context",{action:"store_initial",workspace_id:o,plan_id:s.planId,user_request:s.userRequest,files_mentioned:s.filesMentioned,file_contents:s.fileContents,requirements:s.requirements,constraints:s.constraints,examples:s.examples,conversation_context:s.conversationContext,additional_notes:s.additionalNotes});break}case"list":{if(!s.planId)return le("planId is required for list");r=await t.mcpBridge.callTool("memory_context",{action:"list",workspace_id:o,plan_id:s.planId});break}case"list_research":{if(!s.planId)return le("planId is required for list_research");r=await t.mcpBridge.callTool("memory_context",{action:"list_research",workspace_id:o,plan_id:s.planId});break}case"append_research":{if(!s.planId||!s.filename||!s.content)return le("planId, filename, and content are required for append_research");r=await t.mcpBridge.callTool("memory_context",{action:"append_research",workspace_id:o,plan_id:s.planId,filename:s.filename,content:s.content});break}case"batch_store":{if(!s.planId||!s.items||s.items.length===0)return le("planId and items array are required for batch_store");r=await t.mcpBridge.callTool("memory_context",{action:"batch_store",workspace_id:o,plan_id:s.planId,items:s.items});break}case"workspace_get":case"workspace_set":case"workspace_update":case"workspace_delete":{if(!s.type)return le("type is required for workspace-scoped context");r=await t.mcpBridge.callTool("memory_context",{action:s.action,workspace_id:o,type:s.type,data:s.data});break}default:return le(`Unknown action: ${s.action}`)}return new ot.LanguageModelToolResult([new ot.LanguageModelTextPart(JSON.stringify(r,null,2))])}catch(o){return le(o)}}function le(n){let e=n instanceof Error?n.message:String(n);return new ot.LanguageModelToolResult([new ot.LanguageModelTextPart(JSON.stringify({success:!1,error:e}))])}var St=class{mcpBridge;workspaceId=null;disposables=[];ctx;constructor(e){this.mcpBridge=e,this.ctx={mcpBridge:this.mcpBridge,ensureWorkspace:()=>this.ensureWorkspace(),setWorkspaceId:t=>{this.workspaceId=t}},this.registerTools()}resetWorkspace(){this.workspaceId=null}registerTools(){this.disposables.push(Fe.lm.registerTool("memory_workspace",{invoke:(e,t)=>Dn(e,t,this.ctx)})),this.disposables.push(Fe.lm.registerTool("memory_agent",{invoke:(e,t)=>Fn(e,t,this.ctx)})),this.disposables.push(Fe.lm.registerTool("memory_plan",{invoke:(e,t)=>Ln(e,t,this.ctx)})),this.disposables.push(Fe.lm.registerTool("memory_steps",{invoke:(e,t)=>Bn(e,t,this.ctx)})),this.disposables.push(Fe.lm.registerTool("memory_context",{invoke:(e,t)=>Hn(e,t,this.ctx)}))}async ensureWorkspace(){if(this.workspaceId)return this.workspaceId;let e=Fe.workspace.workspaceFolders?.[0];if(!e)throw new Error("No workspace folder open");let t=await this.mcpBridge.callTool("memory_workspace",{action:"register",workspace_path:e.uri.fsPath});return this.workspaceId=t.workspace_id,this.workspaceId}dispose(){this.disposables.forEach(e=>e.dispose()),this.disposables=[]}};var ai=P(require("vscode")),ws=class{constructor(e,t,o){this.serverManager=e;this.getMcpBridge=t;this.serverPort=o}extensionStartTime=Date.now();healthCheckTimer=null;lastReport=null;_onHealthChange=new ai.EventEmitter;onHealthChange=this._onHealthChange.event;startMonitoring(e=3e4){this.healthCheckTimer||(this.healthCheckTimer=setInterval(()=>{this.runCheck()},e),this.runCheck())}stopMonitoring(){this.healthCheckTimer&&(clearInterval(this.healthCheckTimer),this.healthCheckTimer=null)}async runCheck(){let e=[],t=this.serverManager.isContainerMode,o=this.serverManager.isRunning||t,s=this.serverManager.isExternalServer,r=this.serverManager.isFrontendRunning||t;o||e.push("Dashboard server is not running");let i=this.getMcpBridge(),a=i?.isConnected()??!1,c=null,l=null;if(a&&i)try{let v=Date.now();await Promise.race([i.callTool("memory_workspace",{action:"list"}),new Promise((_,D)=>setTimeout(()=>D(new Error("MCP probe timeout (5s)")),5e3))]),c=Date.now()-v,c>3e3&&e.push(`MCP server slow: ${c}ms response time`)}catch(v){l=v instanceof Error?v.message:String(v),e.push(`MCP health probe failed: ${l}`)}a||e.push("MCP server is not connected");let u=process.memoryUsage(),d=Math.round(u.heapUsed/1024/1024*100)/100;d>500&&e.push(`High memory usage: ${d} MB`);let p=Math.floor((Date.now()-this.extensionStartTime)/1e3),h="green";e.length>0&&(h=e.some(v=>v.includes("not running")||v.includes("not connected"))?"red":"yellow");let w={timestamp:new Date().toISOString(),server:{running:o,external:s,containerMode:t,port:this.serverPort,frontendRunning:r},mcp:{connected:a,lastProbeMs:c,probeError:l},extension:{memoryMB:d,uptime:p},health:h,issues:e};return this.lastReport=w,this._onHealthChange.fire(w),w}async getReport(){return this.lastReport?this.lastReport:this.runCheck()}formatReport(e){let t=[];return t.push("=== Project Memory Diagnostics ==="),t.push(`Timestamp: ${e.timestamp}`),t.push(`Health: ${e.health.toUpperCase()}`),t.push(""),t.push("--- Dashboard Server ---"),t.push(`  Running: ${e.server.running}`),t.push(`  Mode: ${e.server.containerMode?"container":e.server.external?"external":"local"}`),t.push(`  Port: ${e.server.port}`),t.push(`  Frontend: ${e.server.frontendRunning}`),t.push(""),t.push("--- MCP Server ---"),t.push(`  Connected: ${e.mcp.connected}`),e.mcp.lastProbeMs!==null&&t.push(`  Last probe: ${e.mcp.lastProbeMs}ms`),e.mcp.probeError&&t.push(`  Probe error: ${e.mcp.probeError}`),t.push(""),t.push("--- Extension ---"),t.push(`  Memory: ${e.extension.memoryMB} MB`),t.push(`  Uptime: ${e.extension.uptime}s`),t.push(""),e.issues.length>0?(t.push("--- Issues ---"),e.issues.forEach(o=>t.push(`  \u26A0 ${o}`))):t.push("No issues detected."),t.join(`
`)}dispose(){this.stopMonitoring(),this._onHealthChange.dispose()}};var vs=P(require("vscode"));function F(n,...e){return vs.workspace.getConfiguration("projectMemory").get("showNotifications",!0)?vs.window.showInformationMessage(n,...e):Promise.resolve(void 0)}async function ci(n,e){try{let t=fe(e),o=t?t.projectPath:e,s=await fetch(`http://localhost:${n}/api/workspaces/register`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({workspace_path:o})});if(!s.ok)return null;let i=(await s.json()).workspace;return i?.workspace_id||i?.id||null}catch{return null}}var ys=P(require("vscode")),li=P(require("path"));function bs(n){let e=ys.workspace.workspaceFolders;if(e){let t=fe(e[0].uri.fsPath);return t?li.join(t.projectPath,n):ys.Uri.joinPath(e[0].uri,n).fsPath}return""}function Nn(){return bs("data")}function Le(){return bs("agents")}function qe(){return bs("instructions")}function _s(){return bs("prompts")}var I=P(require("vscode"));var ve=P(require("vscode")),ks=class n{static currentPanel;_panel;_disposables=[];static viewType="projectMemory.dashboard";constructor(e,t,o){this._panel=e,this._update(o),this._panel.onDidDispose(()=>this.dispose(),null,this._disposables),this._panel.webview.onDidReceiveMessage(s=>{s.type==="alert"&&ve.window.showInformationMessage(s.text)},null,this._disposables)}static createOrShow(e,t){let o=ve.window.activeTextEditor?ve.window.activeTextEditor.viewColumn:void 0;if(n.currentPanel){n.currentPanel._panel.reveal(o),n.currentPanel._update(t);return}let s=ve.window.createWebviewPanel(n.viewType,"\u{1F9E0} PMD",o||ve.ViewColumn.One,{enableScripts:!0,retainContextWhenHidden:!0,localResourceRoots:[e]});n.currentPanel=new n(s,e,t)}static revive(e,t,o){n.currentPanel=new n(e,t,o)}_update(e){let t=this._panel.webview;this._panel.title="\u{1F9E0} PMD",this._panel.iconPath={light:ve.Uri.joinPath(ve.Uri.file(__dirname),"..","resources","icon.svg"),dark:ve.Uri.joinPath(ve.Uri.file(__dirname),"..","resources","icon.svg")},t.html=this._getHtmlForWebview(t,e)}_getHtmlForWebview(e,t){let o=Al();return`<!DOCTYPE html>
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
    
    <script nonce="${o}">
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
</html>`}dispose(){for(n.currentPanel=void 0,this._panel.dispose();this._disposables.length;){let e=this._disposables.pop();e&&e.dispose()}}};function Al(){let n="",e="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";for(let t=0;t<32;t++)n+=e.charAt(Math.floor(Math.random()*e.length));return n}function On(n,e,t,o){n.subscriptions.push(I.commands.registerCommand("projectMemory.showDashboard",()=>{I.commands.executeCommand("workbench.view.extension.projectMemory")}),I.commands.registerCommand("projectMemory.openDashboardPanel",async s=>{if(!e.isContainerMode){if(!e.isRunning){if(await I.window.showWarningMessage("Project Memory server is not running. Start it first?","Start Server","Cancel")!=="Start Server")return;if(!await I.window.withProgress({location:I.ProgressLocation.Notification,title:"Starting Project Memory server...",cancellable:!1},async()=>await e.start())){I.window.showErrorMessage("Failed to start server. Check logs for details."),e.showLogs();return}}if(!e.isFrontendRunning&&!await I.window.withProgress({location:I.ProgressLocation.Notification,title:"Starting dashboard frontend...",cancellable:!1},async()=>await e.startFrontend())){I.window.showErrorMessage("Failed to start dashboard frontend. Check server logs."),e.showLogs();return}}let r=s||He();ks.createOrShow(n.extensionUri,r)}),I.commands.registerCommand("projectMemory.toggleServer",async()=>{e.isRunning?(await e.stopFrontend(),await e.stop(),F("Project Memory server stopped")):await e.start()?F("Project Memory server started"):I.window.showErrorMessage("Failed to start Project Memory server")}),I.commands.registerCommand("projectMemory.startServer",async()=>{if(e.isRunning){F("Server is already running");return}await e.start()?F("Project Memory server started"):(I.window.showErrorMessage("Failed to start server. Check logs for details."),e.showLogs())}),I.commands.registerCommand("projectMemory.stopServer",async()=>{await e.stopFrontend(),await e.stop(),F("Project Memory server stopped")}),I.commands.registerCommand("projectMemory.restartServer",async()=>{F("Restarting Project Memory server..."),await e.stopFrontend(),await e.restart()?F("Project Memory server restarted"):I.window.showErrorMessage("Failed to restart server")}),I.commands.registerCommand("projectMemory.showServerLogs",()=>{e.showLogs()}),I.commands.registerCommand("projectMemory.forceStopExternalServer",async()=>{let r=I.workspace.getConfiguration("projectMemory").get("serverPort")||3001;if(await I.window.showWarningMessage(`Force stop the external server on port ${r}?`,{modal:!0},"Force Stop")!=="Force Stop")return;await e.forceStopExternalServer()?F("External server stopped"):(I.window.showErrorMessage("Failed to stop external server. Check logs for details."),e.showLogs())}),I.commands.registerCommand("projectMemory.isolateServer",async()=>{let s=I.workspace.getConfiguration("projectMemory"),r=s.get("serverPort")||3001,i=r!==3001;if(i)await s.update("serverPort",3001,I.ConfigurationTarget.Workspace),await e.stopFrontend(),await e.stop(),I.window.showInformationMessage("Switching to shared server on port 3001. Reloading window...","Reload").then(a=>{a==="Reload"&&I.commands.executeCommand("workbench.action.reloadWindow")});else{let a=I.workspace.workspaceFolders?.[0];if(!a){I.window.showErrorMessage("No workspace folder open");return}let c=require("crypto").createHash("md5").update(a.uri.fsPath.toLowerCase()).digest("hex"),l=3101+parseInt(c.substring(0,4),16)%99;await s.update("serverPort",l,I.ConfigurationTarget.Workspace),await e.stopFrontend(),await e.stop(),I.window.showInformationMessage(`Switching to isolated server on port ${l}. Reloading window...`,"Reload").then(u=>{u==="Reload"&&I.commands.executeCommand("workbench.action.reloadWindow")})}t?.postMessage({type:"isolateServerStatus",data:{isolated:!i,port:i?3001:r}})}),I.commands.registerCommand("projectMemory.refreshData",()=>{t.postMessage({type:"refresh"})}))}var R=P(require("vscode")),te=P(require("path")),se=P(require("fs"));function jn(n,e,t){n.subscriptions.push(R.commands.registerCommand("projectMemory.deployAgents",async()=>{let o=R.workspace.workspaceFolders;if(!o){R.window.showErrorMessage("No workspace folder open");return}let s=R.workspace.getConfiguration("projectMemory"),i=s.get("agentsRoot")||Le(),a=s.get("instructionsRoot")||qe(),c=s.get("defaultAgents")||[],l=s.get("defaultInstructions")||[];if(!i){R.window.showErrorMessage("Agents root not configured. Set projectMemory.agentsRoot in settings.");return}let u=o[0].uri.fsPath;try{let d=se.readdirSync(i).filter(x=>x.endsWith(".agent.md"));if(d.length===0){R.window.showWarningMessage("No agent files found in agents root");return}let p=d.map(x=>{let S=x.replace(".agent.md","");return{label:S,description:x,picked:c.length===0||c.includes(S)}}),h=await R.window.showQuickPick(p,{canPickMany:!0,placeHolder:"Select agents to deploy",title:"Deploy Agents"});if(!h||h.length===0)return;let w=te.join(u,".github","agents");se.mkdirSync(w,{recursive:!0});let v=0;for(let x of h){let S=`${x.label}.agent.md`,V=te.join(i,S),W=te.join(w,S);se.copyFileSync(V,W),v++}let _=0;if(a&&l.length>0){let x=te.join(u,".github","instructions");se.mkdirSync(x,{recursive:!0});for(let S of l){let V=`${S}.instructions.md`,W=te.join(a,V),he=te.join(x,V);se.existsSync(W)&&(se.copyFileSync(W,he),_++)}}e.postMessage({type:"deploymentComplete",data:{type:"agents",count:v,instructionsCount:_,targetDir:w}});let D=_>0?`Deployed ${v} agent(s) and ${_} instruction(s)`:`Deployed ${v} agent(s)`;F(D,"Open Folder").then(x=>{x==="Open Folder"&&R.commands.executeCommand("revealInExplorer",R.Uri.file(w))})}catch(d){R.window.showErrorMessage(`Failed to deploy agents: ${d}`)}}),R.commands.registerCommand("projectMemory.deployPrompts",async()=>{let o=R.workspace.workspaceFolders;if(!o){R.window.showErrorMessage("No workspace folder open");return}let s=R.workspace.getConfiguration("projectMemory"),r=s.get("promptsRoot")||_s(),i=s.get("defaultPrompts")||[];if(!r){R.window.showErrorMessage("Prompts root not configured. Set projectMemory.promptsRoot in settings.");return}let a=o[0].uri.fsPath;try{let c=se.readdirSync(r).filter(h=>h.endsWith(".prompt.md"));if(c.length===0){R.window.showWarningMessage("No prompt files found in prompts root");return}let l=c.map(h=>{let w=h.replace(".prompt.md","");return{label:w,description:h,picked:i.length===0||i.includes(w)}}),u=await R.window.showQuickPick(l,{canPickMany:!0,placeHolder:"Select prompts to deploy",title:"Deploy Prompts"});if(!u||u.length===0)return;let d=te.join(a,".github","prompts");se.mkdirSync(d,{recursive:!0});let p=0;for(let h of u){let w=`${h.label}.prompt.md`,v=te.join(r,w),_=te.join(d,w);se.copyFileSync(v,_),p++}e.postMessage({type:"deploymentComplete",data:{type:"prompts",count:p,targetDir:d}}),F(`Deployed ${p} prompt(s) to ${te.relative(a,d)}`,"Open Folder").then(h=>{h==="Open Folder"&&R.commands.executeCommand("revealInExplorer",R.Uri.file(d))})}catch(c){R.window.showErrorMessage(`Failed to deploy prompts: ${c}`)}}),R.commands.registerCommand("projectMemory.deployInstructions",async()=>{let o=R.workspace.workspaceFolders;if(!o){R.window.showErrorMessage("No workspace folder open");return}let s=R.workspace.getConfiguration("projectMemory"),r=s.get("instructionsRoot")||qe(),i=s.get("defaultInstructions")||[];if(!r){R.window.showErrorMessage("Instructions root not configured. Set projectMemory.instructionsRoot in settings.");return}let a=o[0].uri.fsPath;try{let c=se.readdirSync(r).filter(h=>h.endsWith(".instructions.md"));if(c.length===0){R.window.showWarningMessage("No instruction files found in instructions root");return}let l=c.map(h=>{let w=h.replace(".instructions.md","");return{label:w,description:h,picked:i.length===0||i.includes(w)}}),u=await R.window.showQuickPick(l,{canPickMany:!0,placeHolder:"Select instructions to deploy",title:"Deploy Instructions"});if(!u||u.length===0)return;let d=te.join(a,".github","instructions");se.mkdirSync(d,{recursive:!0});let p=0;for(let h of u){let w=`${h.label}.instructions.md`,v=te.join(r,w),_=te.join(d,w);se.copyFileSync(v,_),p++}e.postMessage({type:"deploymentComplete",data:{type:"instructions",count:p,targetDir:d}}),F(`Deployed ${p} instruction(s) to ${te.relative(a,d)}`,"Open Folder").then(h=>{h==="Open Folder"&&R.commands.executeCommand("revealInExplorer",R.Uri.file(d))})}catch(c){R.window.showErrorMessage(`Failed to deploy instructions: ${c}`)}}),R.commands.registerCommand("projectMemory.deployCopilotConfig",async()=>{let o=R.workspace.workspaceFolders;if(!o){R.window.showErrorMessage("No workspace folder open");return}await R.window.showQuickPick(["Yes","No"],{placeHolder:"Deploy all Copilot config (agents, prompts, instructions)?"})==="Yes"&&(e.postMessage({type:"deployAllCopilotConfig",data:{workspacePath:o[0].uri.fsPath}}),F("Deploying all Copilot configuration..."))}),R.commands.registerCommand("projectMemory.deployDefaults",async()=>{let o=R.workspace.workspaceFolders;if(!o){R.window.showErrorMessage("No workspace folder open");return}let s=t.getDeploymentPlan();if(await R.window.showQuickPick(["Yes","No"],{placeHolder:`Deploy ${s.agents.length} agents and ${s.instructions.length} instructions?`})==="Yes"){let i=await t.deployToWorkspace(o[0].uri.fsPath);F(`Deployed ${i.agents.length} agents and ${i.instructions.length} instructions`)}}),R.commands.registerCommand("projectMemory.updateDefaults",async()=>{let o=R.workspace.workspaceFolders;if(!o){R.window.showErrorMessage("No workspace folder open");return}let s=await t.updateWorkspace(o[0].uri.fsPath);s.updated.length>0||s.added.length>0?F(`Updated ${s.updated.length} files, added ${s.added.length} new files`):F("All files are up to date")}))}var L=P(require("vscode")),di=P(require("path"));function Wn(n,e,t){n.subscriptions.push(L.commands.registerCommand("projectMemory.createPlan",async()=>{let o=L.workspace.workspaceFolders;if(!o){L.window.showErrorMessage("No workspace folder open");return}let s=t(),r=await L.window.showQuickPick([{label:"\u{1F9E0} Brainstorm First",description:"Explore ideas with an AI agent before creating a formal plan",value:"brainstorm"},{label:"\u{1F4DD} Create Plan Directly",description:"Create a formal plan with title, description, and category",value:"create"}],{placeHolder:"How would you like to start?"});if(!r)return;if(r.value==="brainstorm"){let x=await L.window.showInputBox({prompt:"What would you like to brainstorm?",placeHolder:"Describe the feature, problem, or idea you want to explore...",validateInput:S=>S.trim()?null:"Please enter a description"});if(!x)return;try{await L.commands.executeCommand("workbench.action.chat.open",{query:`@brainstorm ${x}`})}catch{await L.window.showInformationMessage("Open GitHub Copilot Chat and use @brainstorm agent with your prompt.","Copy Prompt")==="Copy Prompt"&&(await L.env.clipboard.writeText(`@brainstorm ${x}`),F("Prompt copied to clipboard"))}return}let i=await L.window.showInputBox({prompt:"Enter plan title",placeHolder:"My new feature...",validateInput:x=>x.trim()?null:"Title is required"});if(!i)return;let a=await L.window.showInputBox({prompt:"Enter plan description",placeHolder:"Describe what this plan will accomplish, the goals, and any context...",validateInput:x=>x.trim().length>=10?null:"Please provide at least a brief description (10+ characters)"});if(!a)return;let c=x=>x?x.split(/[,\n]+/).map(S=>S.trim()).filter(S=>S.length>0):[],l=[];try{let x=await fetch(`http://localhost:${s}/api/plans/templates`);if(x.ok){let S=await x.json();l=Array.isArray(S.templates)?S.templates:[]}}catch{}l.length===0&&(l=[{template:"feature",label:"Feature",category:"feature"},{template:"bugfix",label:"Bug Fix",category:"bug"},{template:"refactor",label:"Refactor",category:"refactor"},{template:"documentation",label:"Documentation",category:"documentation"},{template:"analysis",label:"Analysis",category:"analysis"},{template:"investigation",label:"Investigation",category:"investigation"}]);let u=await L.window.showQuickPick([{label:"Custom",description:"Choose category and define your own steps",value:"custom"},...l.map(x=>({label:x.label||x.template,description:x.category||x.template,value:x.template}))],{placeHolder:"Select a plan template (optional)"});if(!u)return;let d=u.value!=="custom"?u.value:null,p=null,h=[],w=[];if(!d){let x=await L.window.showQuickPick([{label:"\u2728 Feature",description:"New functionality or capability",value:"feature"},{label:"\u{1F41B} Bug",description:"Fix for an existing issue",value:"bug"},{label:"\u{1F504} Change",description:"Modification to existing behavior",value:"change"},{label:"\u{1F50D} Analysis",description:"Investigation or research task",value:"analysis"},{label:"\u{1F9EA} Investigation",description:"Deep-dive analysis with findings",value:"investigation"},{label:"\u{1F41E} Debug",description:"Debugging session for an issue",value:"debug"},{label:"\u267B\uFE0F Refactor",description:"Code improvement without behavior change",value:"refactor"},{label:"\u{1F4DA} Documentation",description:"Documentation updates",value:"documentation"}],{placeHolder:"Select plan category"});if(!x)return;p=x.value}let v=await L.window.showQuickPick([{label:"\u{1F534} Critical",description:"Urgent - needs immediate attention",value:"critical"},{label:"\u{1F7E0} High",description:"Important - should be done soon",value:"high"},{label:"\u{1F7E1} Medium",description:"Normal priority",value:"medium"},{label:"\u{1F7E2} Low",description:"Nice to have - when time permits",value:"low"}],{placeHolder:"Select priority level"});if(!v)return;if(!d&&p==="investigation"){let x=await L.window.showInputBox({prompt:"Enter investigation goals (comma-separated)",placeHolder:"Identify root cause, confirm scope"});h=c(x);let S=await L.window.showInputBox({prompt:"Enter success criteria (comma-separated)",placeHolder:"Root cause identified, resolution path defined"});if(w=c(S),h.length===0||w.length===0){L.window.showErrorMessage("Investigation plans require at least 1 goal and 1 success criteria.");return}}let _=o[0].uri.fsPath,D=await ci(s,_);if(!D){L.window.showErrorMessage("Failed to register workspace with the dashboard server.");return}try{let x={title:i,description:a,priority:v.value,goals:h.length>0?h:void 0,success_criteria:w.length>0?w:void 0},S=d?await fetch(`http://localhost:${s}/api/plans/${D}/template`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...x,template:d})}):await fetch(`http://localhost:${s}/api/plans/${D}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...x,category:p})});if(S.ok){let V=await S.json(),W=V.plan_id||V.plan?.id||V.plan?.plan_id||V.planId;F(`Plan created: ${i}`,"Open Dashboard").then(he=>{he==="Open Dashboard"&&W&&L.commands.executeCommand("projectMemory.openDashboardPanel",`${He()}/workspace/${D}/plan/${W}`)})}else{let V=await S.text();L.window.showErrorMessage(`Failed to create plan: ${V}`)}}catch(x){L.window.showErrorMessage(`Failed to create plan: ${x}`)}}),L.commands.registerCommand("projectMemory.addToPlan",async o=>{let s,r,i;if(o)s=o.fsPath;else{let u=L.window.activeTextEditor;if(u){s=u.document.uri.fsPath;let d=u.selection;d.isEmpty||(r=u.document.getText(d),i=d.start.line+1)}}if(!s){L.window.showErrorMessage("No file selected");return}if(!L.workspace.workspaceFolders){L.window.showErrorMessage("No workspace folder open");return}let c=await L.window.showInputBox({prompt:"Describe the step/task for this file",placeHolder:"e.g., Review and update authentication logic",value:r?`Review: ${r.substring(0,50)}...`:`Work on ${di.basename(s)}`});if(!c)return;let l=await L.window.showQuickPick(["investigation","research","analysis","planning","implementation","testing","validation","review","documentation","refactor","bugfix","handoff"],{placeHolder:"Select the phase for this step"});l&&(e.postMessage({type:"addStepToPlan",data:{task:c,phase:l,file:s,line:i,notes:r?`Selected code:
\`\`\`
${r.substring(0,500)}
\`\`\``:void 0}}),F(`Added step to plan: "${c}"`))}))}var C=P(require("vscode")),Rt=P(require("path")),rt=P(require("fs"));function qn(n,e,t,o){n.subscriptions.push(C.commands.registerCommand("projectMemory.migrateWorkspace",async()=>{let s=await C.window.showOpenDialog({canSelectFiles:!1,canSelectFolders:!0,canSelectMany:!1,openLabel:"Select Workspace to Migrate",title:"Select a workspace directory to migrate to the new identity system"});if(!s||s.length===0)return;let r=s[0].fsPath,i=o();if(!i){C.window.showErrorMessage("MCP Bridge not initialized. Please wait for the extension to fully load.");return}if(!i.isConnected())try{await i.connect()}catch{C.window.showErrorMessage("Failed to connect to MCP server. Please check the server is configured correctly.");return}await C.window.withProgress({location:C.ProgressLocation.Notification,title:"Migrating workspace...",cancellable:!1},async a=>{try{a.report({message:"Stopping dashboard server..."});let c=e.isRunning;c&&(await e.stopFrontend(),await e.stop()),await new Promise(w=>setTimeout(w,500)),a.report({message:"Running migration..."});let l=await i.callTool("memory_workspace",{action:"migrate",workspace_path:r});c&&(a.report({message:"Restarting dashboard server..."}),await e.start());let u=l.ghost_folders_found?.length||0,d=l.ghost_folders_merged?.length||0,p=l.plans_recovered?.length||0,h=`Migration complete for ${Rt.basename(r)}.
`;h+=`Workspace ID: ${l.workspace_id}
`,u>0&&(h+=`Found ${u} ghost folders, merged ${d}.
`),p>0&&(h+=`Recovered ${p} plans.
`),l.notes&&l.notes.length>0&&(h+=`Notes: ${l.notes.slice(0,3).join("; ")}`),C.window.showInformationMessage(h,{modal:!0})}catch(c){e.isRunning||await e.start(),C.window.showErrorMessage(`Migration failed: ${c.message}`)}})}),C.commands.registerCommand("projectMemory.openSettings",async()=>{let s=C.workspace.getConfiguration("projectMemory"),r=s.get("agentsRoot")||Le(),i=s.get("instructionsRoot")||qe(),a=s.get("promptsRoot")||_s(),c=await C.window.showQuickPick([{label:"$(person) Configure Default Agents",description:"Select which agents to deploy by default",value:"agents"},{label:"$(book) Configure Default Instructions",description:"Select which instructions to deploy by default",value:"instructions"},{label:"$(file) Configure Default Prompts",description:"Select which prompts to deploy by default",value:"prompts"},{label:"$(gear) Open All Settings",description:"Open VS Code settings for Project Memory",value:"settings"}],{placeHolder:"What would you like to configure?"});if(c){if(c.value==="settings"){C.commands.executeCommand("workbench.action.openSettings","@ext:project-memory.project-memory-dashboard");return}if(c.value==="agents"&&r)try{let l=rt.readdirSync(r).filter(h=>h.endsWith(".agent.md")).map(h=>h.replace(".agent.md","")),u=s.get("defaultAgents")||[],d=l.map(h=>({label:h,picked:u.length===0||u.includes(h)})),p=await C.window.showQuickPick(d,{canPickMany:!0,placeHolder:"Select default agents (these will be pre-selected when deploying)",title:"Configure Default Agents"});p&&(await s.update("defaultAgents",p.map(h=>h.label),C.ConfigurationTarget.Global),F(`Updated default agents (${p.length} selected)`))}catch(l){C.window.showErrorMessage(`Failed to read agents: ${l}`)}if(c.value==="instructions"&&i)try{let l=rt.readdirSync(i).filter(h=>h.endsWith(".instructions.md")).map(h=>h.replace(".instructions.md","")),u=s.get("defaultInstructions")||[],d=l.map(h=>({label:h,picked:u.length===0||u.includes(h)})),p=await C.window.showQuickPick(d,{canPickMany:!0,placeHolder:"Select default instructions (these will be pre-selected when deploying)",title:"Configure Default Instructions"});p&&(await s.update("defaultInstructions",p.map(h=>h.label),C.ConfigurationTarget.Global),F(`Updated default instructions (${p.length} selected)`))}catch(l){C.window.showErrorMessage(`Failed to read instructions: ${l}`)}if(c.value==="prompts"&&a)try{let l=rt.readdirSync(a).filter(h=>h.endsWith(".prompt.md")).map(h=>h.replace(".prompt.md","")),u=s.get("defaultPrompts")||[],d=l.map(h=>({label:h,picked:u.length===0||u.includes(h)})),p=await C.window.showQuickPick(d,{canPickMany:!0,placeHolder:"Select default prompts (these will be pre-selected when deploying)",title:"Configure Default Prompts"});p&&(await s.update("defaultPrompts",p.map(h=>h.label),C.ConfigurationTarget.Global),F(`Updated default prompts (${p.length} selected)`))}catch(l){C.window.showErrorMessage(`Failed to read prompts: ${l}`)}}}),C.commands.registerCommand("projectMemory.openAgentFile",async()=>{let r=C.workspace.getConfiguration("projectMemory").get("agentsRoot")||Le();if(!r){C.window.showErrorMessage("Agents root not configured");return}try{let i=rt.readdirSync(r).filter(c=>c.endsWith(".agent.md")),a=await C.window.showQuickPick(i,{placeHolder:"Select an agent file to open"});if(a){let c=Rt.join(r,a),l=await C.workspace.openTextDocument(c);await C.window.showTextDocument(l)}}catch(i){C.window.showErrorMessage(`Failed to list agent files: ${i}`)}}),C.commands.registerCommand("projectMemory.openPromptFile",async()=>{let r=C.workspace.getConfiguration("projectMemory").get("promptsRoot");if(!r){C.window.showErrorMessage("Prompts root not configured. Set projectMemory.promptsRoot in settings.");return}try{let i=rt.readdirSync(r).filter(c=>c.endsWith(".prompt.md")),a=await C.window.showQuickPick(i,{placeHolder:"Select a prompt file to open"});if(a){let c=Rt.join(r,a),l=await C.workspace.openTextDocument(c);await C.window.showTextDocument(l)}}catch(i){C.window.showErrorMessage(`Failed to list prompt files: ${i}`)}}),C.commands.registerCommand("projectMemory.showCopilotStatus",()=>{t.postMessage({type:"showCopilotStatus"}),C.commands.executeCommand("workbench.view.extension.projectMemory")}),C.commands.registerCommand("projectMemory.openFile",async(s,r)=>{try{let i=await C.workspace.openTextDocument(s),a=await C.window.showTextDocument(i);if(r!==void 0){let c=new C.Position(r-1,0);a.selection=new C.Selection(c,c),a.revealRange(new C.Range(c,c),C.TextEditorRevealType.InCenter)}}catch{C.window.showErrorMessage(`Failed to open file: ${s}`)}}))}var xe,Et,ct,Gn,J,Un,it,ae=null,Ue=null,Ge=null,at=null;function Ml(n){console.log("Project Memory Dashboard extension activating...");let e=U.workspace.getConfiguration("projectMemory"),t=e.get("dataRoot")||Nn(),o=e.get("agentsRoot")||Le(),s=e.get("promptsRoot"),r=e.get("instructionsRoot"),i=e.get("serverPort")||3001,a=e.get("wsPort")||3002,c=e.get("autoStartServer")??!0,l=e.get("defaultAgents")||[],u=e.get("defaultInstructions")||[],d=e.get("autoDeployOnWorkspaceOpen")??!1;Un=new fs({agentsRoot:o,instructionsRoot:r||qe(),defaultAgents:l,defaultInstructions:u}),J=new hs({dataRoot:t,agentsRoot:o,promptsRoot:s,instructionsRoot:r,serverPort:i,wsPort:a}),n.subscriptions.push(J),xe=new Ft(n.extensionUri,t,o),xe.onFirstResolve(()=>{Vn()}),Gn=new rs,n.subscriptions.push(Gn),n.subscriptions.push(U.window.registerWebviewViewProvider("projectMemory.dashboardView",xe,{webviewOptions:{retainContextWhenHidden:!0}}));let p=()=>e.get("serverPort")||3001;On(n,J,xe,p),jn(n,xe,Un),Wn(n,xe,p),qn(n,J,xe,()=>ae),it=new ws(J,()=>ae,i),n.subscriptions.push(it),it.startMonitoring(6e4);let h=U.window.createStatusBarItem(U.StatusBarAlignment.Right,99);if(h.command="projectMemory.showDiagnostics",h.text="$(pulse) PM",h.tooltip="Project Memory: Click for diagnostics",h.show(),n.subscriptions.push(h),it.onHealthChange(v=>{let _={green:"$(check)",yellow:"$(warning)",red:"$(error)"};h.text=`${_[v.health]} PM`,h.tooltip=v.issues.length>0?`Project Memory: ${v.issues.join("; ")}`:"Project Memory: All systems healthy"}),n.subscriptions.push(U.commands.registerCommand("projectMemory.showDiagnostics",async()=>{let v=await it.runCheck(),_=U.window.createOutputChannel("Project Memory Diagnostics");_.clear(),_.appendLine(it.formatReport(v)),_.show()})),d&&U.workspace.workspaceFolders?.[0]){let v=U.workspace.workspaceFolders[0].uri.fsPath;Un.deployToWorkspace(v).then(_=>{(_.agents.length>0||_.instructions.length>0)&&F(`Deployed ${_.agents.length} agents and ${_.instructions.length} instructions`)})}c&&J.hasServerDirectory()&&Vn();let w=e.get("idleServerTimeoutMinutes")||0;w>0&&J.startIdleMonitoring(w),Dl(n,e,t),setTimeout(()=>{Fl(n,e,o,s,r)},2e3),n.subscriptions.push(U.workspace.onDidChangeConfiguration(v=>{if(v.affectsConfiguration("projectMemory")){let _=U.workspace.getConfiguration("projectMemory");xe.updateConfig(_.get("dataRoot")||Nn(),_.get("agentsRoot")||Le())}})),console.log("Project Memory Dashboard extension activated")}async function $l(){if(console.log("Project Memory Dashboard extension deactivating..."),ae){try{await ae.disconnect(),ae.dispose()}catch(n){console.error("Error disconnecting MCP bridge:",n)}ae=null}if(Ue&&(Ue.dispose(),Ue=null),Ge&&(Ge.dispose(),Ge=null),xe&&xe.dispose(),Et&&Et.stop(),ct&&ct.stop(),J)try{await Promise.race([(async()=>{await J.stopFrontend(),await J.stop(),await J.forceStopOwnedServer()})(),new Promise(n=>setTimeout(n,5e3))])}catch(n){console.error("Error stopping servers during deactivation:",n);try{await J.forceStopOwnedServer()}catch{}}console.log("Project Memory Dashboard extension deactivated")}async function Vn(){return J?J.isRunning?!0:J.hasServerDirectory()?at||(at=J.start().then(n=>(at=null,n?J.isExternalServer?F("Connected to existing Project Memory server"):F("Project Memory API server started"):U.window.showWarningMessage("Failed to start Project Memory server. Click to view logs.","View Logs").then(e=>{e==="View Logs"&&J.showLogs()}),n)).catch(n=>(at=null,console.error("Server start failed:",n),!1)),at):!1:!1}function Dl(n,e,t){let o=e.get("chat.serverMode")||"bundled",s=e.get("chat.podmanImage")||"project-memory-mcp:latest",r=e.get("chat.externalServerPath")||"",i=e.get("chat.autoConnect")??!0;ae=new Ct({serverMode:o,podmanImage:s,externalServerPath:r,dataRoot:t}),n.subscriptions.push(ae),ae.onConnectionChange(a=>{a&&(Ue?.resetWorkspace(),Ge?.resetWorkspace())}),Ue=new Pt(ae),n.subscriptions.push(Ue),Ge=new St(ae),n.subscriptions.push(Ge),n.subscriptions.push(U.commands.registerCommand("projectMemory.chat.reconnect",async()=>{if(!ae){U.window.showErrorMessage("MCP Bridge not initialized");return}try{await U.window.withProgress({location:U.ProgressLocation.Notification,title:"Reconnecting to MCP server...",cancellable:!1},async()=>{await ae.reconnect()}),F("Connected to MCP server")}catch(a){let c=a instanceof Error?a.message:String(a);U.window.showErrorMessage(`Failed to connect: ${c}`),ae.showLogs()}})),i&&ae.connect().then(()=>{console.log("MCP Bridge connected")}).catch(a=>{console.warn("MCP Bridge auto-connect failed:",a)}),n.subscriptions.push(U.workspace.onDidChangeConfiguration(a=>{a.affectsConfiguration("projectMemory.chat")&&F("Chat configuration changed. Some changes may require reconnecting.","Reconnect").then(c=>{c==="Reconnect"&&U.commands.executeCommand("projectMemory.chat.reconnect")})})),n.subscriptions.push(U.workspace.onDidChangeWorkspaceFolders(()=>{Ue?.resetWorkspace(),Ge?.resetWorkspace()})),console.log("Chat integration initialized")}function Fl(n,e,t,o,s){t&&(Et=new ss(t,e.get("autoDeployAgents")||!1),Et.start(),n.subscriptions.push({dispose:()=>Et.stop()})),ct=new ns({agentsRoot:t,promptsRoot:o,instructionsRoot:s,autoDeploy:e.get("autoDeployAgents")||!1}),ct.start(),ct.onFileChanged((r,i,a)=>{a==="change"&&Gn.showTemporaryMessage(`${r} updated`)}),n.subscriptions.push({dispose:()=>ct.stop()})}0&&(module.exports={activate,deactivate,ensureServerRunning});
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
