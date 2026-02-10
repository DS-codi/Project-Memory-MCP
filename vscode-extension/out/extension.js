"use strict";var fi=Object.create;var $t=Object.defineProperty;var mi=Object.getOwnPropertyDescriptor;var wi=Object.getOwnPropertyNames;var vi=Object.getPrototypeOf,yi=Object.prototype.hasOwnProperty;var H=(o,e)=>()=>(e||o((e={exports:{}}).exports,e),e.exports),_i=(o,e)=>{for(var t in e)$t(o,t,{get:e[t],enumerable:!0})},Yo=(o,e,t,s)=>{if(e&&typeof e=="object"||typeof e=="function")for(let n of wi(e))!yi.call(o,n)&&n!==t&&$t(o,n,{get:()=>e[n],enumerable:!(s=mi(e,n))||s.enumerable});return o};var P=(o,e,t)=>(t=o!=null?fi(vi(o)):{},Yo(e||!o||!o.__esModule?$t(t,"default",{value:o,enumerable:!0}):t,o)),ki=o=>Yo($t({},"__esModule",{value:!0}),o);var ut=H((Ql,rs)=>{"use strict";var xi=require("path"),be="\\\\/",ts=`[^${be}]`,Pe="\\.",Ci="\\+",Pi="\\?",Lt="\\/",Si="(?=.)",ns="[^/]",En=`(?:${Lt}|$)`,os=`(?:^|${Lt})`,Tn=`${Pe}{1,2}${En}`,Ri=`(?!${Pe})`,Ei=`(?!${os}${Tn})`,Ti=`(?!${Pe}{0,1}${En})`,Ai=`(?!${Tn})`,Ii=`[^.${Lt}]`,Mi=`${ns}*?`,ss={DOT_LITERAL:Pe,PLUS_LITERAL:Ci,QMARK_LITERAL:Pi,SLASH_LITERAL:Lt,ONE_CHAR:Si,QMARK:ns,END_ANCHOR:En,DOTS_SLASH:Tn,NO_DOT:Ri,NO_DOTS:Ei,NO_DOT_SLASH:Ti,NO_DOTS_SLASH:Ai,QMARK_NO_DOT:Ii,STAR:Mi,START_ANCHOR:os},$i={...ss,SLASH_LITERAL:`[${be}]`,QMARK:ts,STAR:`${ts}*?`,DOTS_SLASH:`${Pe}{1,2}(?:[${be}]|$)`,NO_DOT:`(?!${Pe})`,NO_DOTS:`(?!(?:^|[${be}])${Pe}{1,2}(?:[${be}]|$))`,NO_DOT_SLASH:`(?!${Pe}{0,1}(?:[${be}]|$))`,NO_DOTS_SLASH:`(?!${Pe}{1,2}(?:[${be}]|$))`,QMARK_NO_DOT:`[^.${be}]`,START_ANCHOR:`(?:^|[${be}])`,END_ANCHOR:`(?:[${be}]|$)`},Di={alnum:"a-zA-Z0-9",alpha:"a-zA-Z",ascii:"\\x00-\\x7F",blank:" \\t",cntrl:"\\x00-\\x1F\\x7F",digit:"0-9",graph:"\\x21-\\x7E",lower:"a-z",print:"\\x20-\\x7E ",punct:"\\-!\"#$%&'()\\*+,./:;<=>?@[\\]^_`{|}~",space:" \\t\\r\\n\\v\\f",upper:"A-Z",word:"A-Za-z0-9_",xdigit:"A-Fa-f0-9"};rs.exports={MAX_LENGTH:1024*64,POSIX_REGEX_SOURCE:Di,REGEX_BACKSLASH:/\\(?![*+?^${}(|)[\]])/g,REGEX_NON_SPECIAL_CHARS:/^[^@![\].,$*+?^{}()|\\/]+/,REGEX_SPECIAL_CHARS:/[-*+?.^${}(|)[\]]/,REGEX_SPECIAL_CHARS_BACKREF:/(\\?)((\W)(\3*))/g,REGEX_SPECIAL_CHARS_GLOBAL:/([-*+?.^${}(|)[\]])/g,REGEX_REMOVE_BACKSLASH:/(?:\[.*?[^\\]\]|\\(?=.))/g,REPLACEMENTS:{"***":"*","**/**":"**","**/**/**":"**"},CHAR_0:48,CHAR_9:57,CHAR_UPPERCASE_A:65,CHAR_LOWERCASE_A:97,CHAR_UPPERCASE_Z:90,CHAR_LOWERCASE_Z:122,CHAR_LEFT_PARENTHESES:40,CHAR_RIGHT_PARENTHESES:41,CHAR_ASTERISK:42,CHAR_AMPERSAND:38,CHAR_AT:64,CHAR_BACKWARD_SLASH:92,CHAR_CARRIAGE_RETURN:13,CHAR_CIRCUMFLEX_ACCENT:94,CHAR_COLON:58,CHAR_COMMA:44,CHAR_DOT:46,CHAR_DOUBLE_QUOTE:34,CHAR_EQUAL:61,CHAR_EXCLAMATION_MARK:33,CHAR_FORM_FEED:12,CHAR_FORWARD_SLASH:47,CHAR_GRAVE_ACCENT:96,CHAR_HASH:35,CHAR_HYPHEN_MINUS:45,CHAR_LEFT_ANGLE_BRACKET:60,CHAR_LEFT_CURLY_BRACE:123,CHAR_LEFT_SQUARE_BRACKET:91,CHAR_LINE_FEED:10,CHAR_NO_BREAK_SPACE:160,CHAR_PERCENT:37,CHAR_PLUS:43,CHAR_QUESTION_MARK:63,CHAR_RIGHT_ANGLE_BRACKET:62,CHAR_RIGHT_CURLY_BRACE:125,CHAR_RIGHT_SQUARE_BRACKET:93,CHAR_SEMICOLON:59,CHAR_SINGLE_QUOTE:39,CHAR_SPACE:32,CHAR_TAB:9,CHAR_UNDERSCORE:95,CHAR_VERTICAL_LINE:124,CHAR_ZERO_WIDTH_NOBREAK_SPACE:65279,SEP:xi.sep,extglobChars(o){return{"!":{type:"negate",open:"(?:(?!(?:",close:`))${o.STAR})`},"?":{type:"qmark",open:"(?:",close:")?"},"+":{type:"plus",open:"(?:",close:")+"},"*":{type:"star",open:"(?:",close:")*"},"@":{type:"at",open:"(?:",close:")"}}},globChars(o){return o===!0?$i:ss}}});var Bt=H(ce=>{"use strict";var Fi=require("path"),Li=process.platform==="win32",{REGEX_BACKSLASH:Bi,REGEX_REMOVE_BACKSLASH:Hi,REGEX_SPECIAL_CHARS:Ni,REGEX_SPECIAL_CHARS_GLOBAL:Oi}=ut();ce.isObject=o=>o!==null&&typeof o=="object"&&!Array.isArray(o);ce.hasRegexChars=o=>Ni.test(o);ce.isRegexChar=o=>o.length===1&&ce.hasRegexChars(o);ce.escapeRegex=o=>o.replace(Oi,"\\$1");ce.toPosixSlashes=o=>o.replace(Bi,"/");ce.removeBackslashes=o=>o.replace(Hi,e=>e==="\\"?"":e);ce.supportsLookbehinds=()=>{let o=process.version.slice(1).split(".").map(Number);return o.length===3&&o[0]>=9||o[0]===8&&o[1]>=10};ce.isWindows=o=>o&&typeof o.windows=="boolean"?o.windows:Li===!0||Fi.sep==="\\";ce.escapeLast=(o,e,t)=>{let s=o.lastIndexOf(e,t);return s===-1?o:o[s-1]==="\\"?ce.escapeLast(o,e,s-1):`${o.slice(0,s)}\\${o.slice(s)}`};ce.removePrefix=(o,e={})=>{let t=o;return t.startsWith("./")&&(t=t.slice(2),e.prefix="./"),t};ce.wrapOutput=(o,e={},t={})=>{let s=t.contains?"":"^",n=t.contains?"":"$",r=`${s}(?:${o})${n}`;return e.negated===!0&&(r=`(?:^(?!${r}).*$)`),r}});var hs=H((Jl,us)=>{"use strict";var is=Bt(),{CHAR_ASTERISK:An,CHAR_AT:ji,CHAR_BACKWARD_SLASH:ht,CHAR_COMMA:Wi,CHAR_DOT:In,CHAR_EXCLAMATION_MARK:Mn,CHAR_FORWARD_SLASH:ps,CHAR_LEFT_CURLY_BRACE:$n,CHAR_LEFT_PARENTHESES:Dn,CHAR_LEFT_SQUARE_BRACKET:Ui,CHAR_PLUS:qi,CHAR_QUESTION_MARK:as,CHAR_RIGHT_CURLY_BRACE:Gi,CHAR_RIGHT_PARENTHESES:cs,CHAR_RIGHT_SQUARE_BRACKET:Vi}=ut(),ls=o=>o===ps||o===ht,ds=o=>{o.isPrefix!==!0&&(o.depth=o.isGlobstar?1/0:1)},zi=(o,e)=>{let t=e||{},s=o.length-1,n=t.parts===!0||t.scanToEnd===!0,r=[],i=[],a=[],c=o,l=-1,p=0,d=0,u=!1,h=!1,w=!1,v=!1,k=!1,D=!1,x=!1,S=!1,V=!1,W=!1,he=0,oe,E,B={value:"",depth:0,isGlob:!1},Z=()=>l>=s,m=()=>c.charCodeAt(l+1),U=()=>(oe=E,c.charCodeAt(++l));for(;l<s;){E=U();let se;if(E===ht){x=B.backslashes=!0,E=U(),E===$n&&(D=!0);continue}if(D===!0||E===$n){for(he++;Z()!==!0&&(E=U());){if(E===ht){x=B.backslashes=!0,U();continue}if(E===$n){he++;continue}if(D!==!0&&E===In&&(E=U())===In){if(u=B.isBrace=!0,w=B.isGlob=!0,W=!0,n===!0)continue;break}if(D!==!0&&E===Wi){if(u=B.isBrace=!0,w=B.isGlob=!0,W=!0,n===!0)continue;break}if(E===Gi&&(he--,he===0)){D=!1,u=B.isBrace=!0,W=!0;break}}if(n===!0)continue;break}if(E===ps){if(r.push(l),i.push(B),B={value:"",depth:0,isGlob:!1},W===!0)continue;if(oe===In&&l===p+1){p+=2;continue}d=l+1;continue}if(t.noext!==!0&&(E===qi||E===ji||E===An||E===as||E===Mn)===!0&&m()===Dn){if(w=B.isGlob=!0,v=B.isExtglob=!0,W=!0,E===Mn&&l===p&&(V=!0),n===!0){for(;Z()!==!0&&(E=U());){if(E===ht){x=B.backslashes=!0,E=U();continue}if(E===cs){w=B.isGlob=!0,W=!0;break}}continue}break}if(E===An){if(oe===An&&(k=B.isGlobstar=!0),w=B.isGlob=!0,W=!0,n===!0)continue;break}if(E===as){if(w=B.isGlob=!0,W=!0,n===!0)continue;break}if(E===Ui){for(;Z()!==!0&&(se=U());){if(se===ht){x=B.backslashes=!0,U();continue}if(se===Vi){h=B.isBracket=!0,w=B.isGlob=!0,W=!0;break}}if(n===!0)continue;break}if(t.nonegate!==!0&&E===Mn&&l===p){S=B.negated=!0,p++;continue}if(t.noparen!==!0&&E===Dn){if(w=B.isGlob=!0,n===!0){for(;Z()!==!0&&(E=U());){if(E===Dn){x=B.backslashes=!0,E=U();continue}if(E===cs){W=!0;break}}continue}break}if(w===!0){if(W=!0,n===!0)continue;break}}t.noext===!0&&(v=!1,w=!1);let O=c,Ae="",g="";p>0&&(Ae=c.slice(0,p),c=c.slice(p),d-=p),O&&w===!0&&d>0?(O=c.slice(0,d),g=c.slice(d)):w===!0?(O="",g=c):O=c,O&&O!==""&&O!=="/"&&O!==c&&ls(O.charCodeAt(O.length-1))&&(O=O.slice(0,-1)),t.unescape===!0&&(g&&(g=is.removeBackslashes(g)),O&&x===!0&&(O=is.removeBackslashes(O)));let f={prefix:Ae,input:o,start:p,base:O,glob:g,isBrace:u,isBracket:h,isGlob:w,isExtglob:v,isGlobstar:k,negated:S,negatedExtglob:V};if(t.tokens===!0&&(f.maxDepth=0,ls(E)||i.push(B),f.tokens=i),t.parts===!0||t.tokens===!0){let se;for(let $=0;$<r.length;$++){let _e=se?se+1:p,ke=r[$],de=o.slice(_e,ke);t.tokens&&($===0&&p!==0?(i[$].isPrefix=!0,i[$].value=Ae):i[$].value=de,ds(i[$]),f.maxDepth+=i[$].depth),($!==0||de!=="")&&a.push(de),se=ke}if(se&&se+1<o.length){let $=o.slice(se+1);a.push($),t.tokens&&(i[i.length-1].value=$,ds(i[i.length-1]),f.maxDepth+=i[i.length-1].depth)}f.slashes=r,f.parts=a}return f};us.exports=zi});var ms=H((Zl,fs)=>{"use strict";var Ht=ut(),pe=Bt(),{MAX_LENGTH:Nt,POSIX_REGEX_SOURCE:Ki,REGEX_NON_SPECIAL_CHARS:Yi,REGEX_SPECIAL_CHARS_BACKREF:Qi,REPLACEMENTS:gs}=Ht,Xi=(o,e)=>{if(typeof e.expandRange=="function")return e.expandRange(...o,e);o.sort();let t=`[${o.join("-")}]`;try{new RegExp(t)}catch{return o.map(n=>pe.escapeRegex(n)).join("..")}return t},ze=(o,e)=>`Missing ${o}: "${e}" - use "\\\\${e}" to match literal characters`,Fn=(o,e)=>{if(typeof o!="string")throw new TypeError("Expected a string");o=gs[o]||o;let t={...e},s=typeof t.maxLength=="number"?Math.min(Nt,t.maxLength):Nt,n=o.length;if(n>s)throw new SyntaxError(`Input length: ${n}, exceeds maximum allowed length: ${s}`);let r={type:"bos",value:"",output:t.prepend||""},i=[r],a=t.capture?"":"?:",c=pe.isWindows(e),l=Ht.globChars(c),p=Ht.extglobChars(l),{DOT_LITERAL:d,PLUS_LITERAL:u,SLASH_LITERAL:h,ONE_CHAR:w,DOTS_SLASH:v,NO_DOT:k,NO_DOT_SLASH:D,NO_DOTS_SLASH:x,QMARK:S,QMARK_NO_DOT:V,STAR:W,START_ANCHOR:he}=l,oe=_=>`(${a}(?:(?!${he}${_.dot?v:d}).)*?)`,E=t.dot?"":k,B=t.dot?S:V,Z=t.bash===!0?oe(t):W;t.capture&&(Z=`(${Z})`),typeof t.noext=="boolean"&&(t.noextglob=t.noext);let m={input:o,index:-1,start:0,dot:t.dot===!0,consumed:"",output:"",prefix:"",backtrack:!1,negated:!1,brackets:0,braces:0,parens:0,quotes:0,globstar:!1,tokens:i};o=pe.removePrefix(o,m),n=o.length;let U=[],O=[],Ae=[],g=r,f,se=()=>m.index===n-1,$=m.peek=(_=1)=>o[m.index+_],_e=m.advance=()=>o[++m.index]||"",ke=()=>o.slice(m.index+1),de=(_="",j=0)=>{m.consumed+=_,m.index+=j},Tt=_=>{m.output+=_.output!=null?_.output:_.value,de(_.value)},hi=()=>{let _=1;for(;$()==="!"&&($(2)!=="("||$(3)==="?");)_e(),m.start++,_++;return _%2===0?!1:(m.negated=!0,m.start++,!0)},At=_=>{m[_]++,Ae.push(_)},Be=_=>{m[_]--,Ae.pop()},I=_=>{if(g.type==="globstar"){let j=m.braces>0&&(_.type==="comma"||_.type==="brace"),y=_.extglob===!0||U.length&&(_.type==="pipe"||_.type==="paren");_.type!=="slash"&&_.type!=="paren"&&!j&&!y&&(m.output=m.output.slice(0,-g.output.length),g.type="star",g.value="*",g.output=Z,m.output+=g.output)}if(U.length&&_.type!=="paren"&&(U[U.length-1].inner+=_.value),(_.value||_.output)&&Tt(_),g&&g.type==="text"&&_.type==="text"){g.value+=_.value,g.output=(g.output||"")+_.value;return}_.prev=g,i.push(_),g=_},It=(_,j)=>{let y={...p[j],conditions:1,inner:""};y.prev=g,y.parens=m.parens,y.output=m.output;let T=(t.capture?"(":"")+y.open;At("parens"),I({type:_,value:j,output:m.output?"":w}),I({type:"paren",extglob:!0,value:_e(),output:T}),U.push(y)},gi=_=>{let j=_.close+(t.capture?")":""),y;if(_.type==="negate"){let T=Z;if(_.inner&&_.inner.length>1&&_.inner.includes("/")&&(T=oe(t)),(T!==Z||se()||/^\)+$/.test(ke()))&&(j=_.close=`)$))${T}`),_.inner.includes("*")&&(y=ke())&&/^\.[^\\/.]+$/.test(y)){let G=Fn(y,{...e,fastpaths:!1}).output;j=_.close=`)${G})${T})`}_.prev.type==="bos"&&(m.negatedExtglob=!0)}I({type:"paren",extglob:!0,value:f,output:j}),Be("parens")};if(t.fastpaths!==!1&&!/(^[*!]|[/()[\]{}"])/.test(o)){let _=!1,j=o.replace(Qi,(y,T,G,re,K,Cn)=>re==="\\"?(_=!0,y):re==="?"?T?T+re+(K?S.repeat(K.length):""):Cn===0?B+(K?S.repeat(K.length):""):S.repeat(G.length):re==="."?d.repeat(G.length):re==="*"?T?T+re+(K?Z:""):Z:T?y:`\\${y}`);return _===!0&&(t.unescape===!0?j=j.replace(/\\/g,""):j=j.replace(/\\+/g,y=>y.length%2===0?"\\\\":y?"\\":"")),j===o&&t.contains===!0?(m.output=o,m):(m.output=pe.wrapOutput(j,m,e),m)}for(;!se();){if(f=_e(),f==="\0")continue;if(f==="\\"){let y=$();if(y==="/"&&t.bash!==!0||y==="."||y===";")continue;if(!y){f+="\\",I({type:"text",value:f});continue}let T=/^\\+/.exec(ke()),G=0;if(T&&T[0].length>2&&(G=T[0].length,m.index+=G,G%2!==0&&(f+="\\")),t.unescape===!0?f=_e():f+=_e(),m.brackets===0){I({type:"text",value:f});continue}}if(m.brackets>0&&(f!=="]"||g.value==="["||g.value==="[^")){if(t.posix!==!1&&f===":"){let y=g.value.slice(1);if(y.includes("[")&&(g.posix=!0,y.includes(":"))){let T=g.value.lastIndexOf("["),G=g.value.slice(0,T),re=g.value.slice(T+2),K=Ki[re];if(K){g.value=G+K,m.backtrack=!0,_e(),!r.output&&i.indexOf(g)===1&&(r.output=w);continue}}}(f==="["&&$()!==":"||f==="-"&&$()==="]")&&(f=`\\${f}`),f==="]"&&(g.value==="["||g.value==="[^")&&(f=`\\${f}`),t.posix===!0&&f==="!"&&g.value==="["&&(f="^"),g.value+=f,Tt({value:f});continue}if(m.quotes===1&&f!=='"'){f=pe.escapeRegex(f),g.value+=f,Tt({value:f});continue}if(f==='"'){m.quotes=m.quotes===1?0:1,t.keepQuotes===!0&&I({type:"text",value:f});continue}if(f==="("){At("parens"),I({type:"paren",value:f});continue}if(f===")"){if(m.parens===0&&t.strictBrackets===!0)throw new SyntaxError(ze("opening","("));let y=U[U.length-1];if(y&&m.parens===y.parens+1){gi(U.pop());continue}I({type:"paren",value:f,output:m.parens?")":"\\)"}),Be("parens");continue}if(f==="["){if(t.nobracket===!0||!ke().includes("]")){if(t.nobracket!==!0&&t.strictBrackets===!0)throw new SyntaxError(ze("closing","]"));f=`\\${f}`}else At("brackets");I({type:"bracket",value:f});continue}if(f==="]"){if(t.nobracket===!0||g&&g.type==="bracket"&&g.value.length===1){I({type:"text",value:f,output:`\\${f}`});continue}if(m.brackets===0){if(t.strictBrackets===!0)throw new SyntaxError(ze("opening","["));I({type:"text",value:f,output:`\\${f}`});continue}Be("brackets");let y=g.value.slice(1);if(g.posix!==!0&&y[0]==="^"&&!y.includes("/")&&(f=`/${f}`),g.value+=f,Tt({value:f}),t.literalBrackets===!1||pe.hasRegexChars(y))continue;let T=pe.escapeRegex(g.value);if(m.output=m.output.slice(0,-g.value.length),t.literalBrackets===!0){m.output+=T,g.value=T;continue}g.value=`(${a}${T}|${g.value})`,m.output+=g.value;continue}if(f==="{"&&t.nobrace!==!0){At("braces");let y={type:"brace",value:f,output:"(",outputIndex:m.output.length,tokensIndex:m.tokens.length};O.push(y),I(y);continue}if(f==="}"){let y=O[O.length-1];if(t.nobrace===!0||!y){I({type:"text",value:f,output:f});continue}let T=")";if(y.dots===!0){let G=i.slice(),re=[];for(let K=G.length-1;K>=0&&(i.pop(),G[K].type!=="brace");K--)G[K].type!=="dots"&&re.unshift(G[K].value);T=Xi(re,t),m.backtrack=!0}if(y.comma!==!0&&y.dots!==!0){let G=m.output.slice(0,y.outputIndex),re=m.tokens.slice(y.tokensIndex);y.value=y.output="\\{",f=T="\\}",m.output=G;for(let K of re)m.output+=K.output||K.value}I({type:"brace",value:f,output:T}),Be("braces"),O.pop();continue}if(f==="|"){U.length>0&&U[U.length-1].conditions++,I({type:"text",value:f});continue}if(f===","){let y=f,T=O[O.length-1];T&&Ae[Ae.length-1]==="braces"&&(T.comma=!0,y="|"),I({type:"comma",value:f,output:y});continue}if(f==="/"){if(g.type==="dot"&&m.index===m.start+1){m.start=m.index+1,m.consumed="",m.output="",i.pop(),g=r;continue}I({type:"slash",value:f,output:h});continue}if(f==="."){if(m.braces>0&&g.type==="dot"){g.value==="."&&(g.output=d);let y=O[O.length-1];g.type="dots",g.output+=f,g.value+=f,y.dots=!0;continue}if(m.braces+m.parens===0&&g.type!=="bos"&&g.type!=="slash"){I({type:"text",value:f,output:d});continue}I({type:"dot",value:f,output:d});continue}if(f==="?"){if(!(g&&g.value==="(")&&t.noextglob!==!0&&$()==="("&&$(2)!=="?"){It("qmark",f);continue}if(g&&g.type==="paren"){let T=$(),G=f;if(T==="<"&&!pe.supportsLookbehinds())throw new Error("Node.js v10 or higher is required for regex lookbehinds");(g.value==="("&&!/[!=<:]/.test(T)||T==="<"&&!/<([!=]|\w+>)/.test(ke()))&&(G=`\\${f}`),I({type:"text",value:f,output:G});continue}if(t.dot!==!0&&(g.type==="slash"||g.type==="bos")){I({type:"qmark",value:f,output:V});continue}I({type:"qmark",value:f,output:S});continue}if(f==="!"){if(t.noextglob!==!0&&$()==="("&&($(2)!=="?"||!/[!=<:]/.test($(3)))){It("negate",f);continue}if(t.nonegate!==!0&&m.index===0){hi();continue}}if(f==="+"){if(t.noextglob!==!0&&$()==="("&&$(2)!=="?"){It("plus",f);continue}if(g&&g.value==="("||t.regex===!1){I({type:"plus",value:f,output:u});continue}if(g&&(g.type==="bracket"||g.type==="paren"||g.type==="brace")||m.parens>0){I({type:"plus",value:f});continue}I({type:"plus",value:u});continue}if(f==="@"){if(t.noextglob!==!0&&$()==="("&&$(2)!=="?"){I({type:"at",extglob:!0,value:f,output:""});continue}I({type:"text",value:f});continue}if(f!=="*"){(f==="$"||f==="^")&&(f=`\\${f}`);let y=Yi.exec(ke());y&&(f+=y[0],m.index+=y[0].length),I({type:"text",value:f});continue}if(g&&(g.type==="globstar"||g.star===!0)){g.type="star",g.star=!0,g.value+=f,g.output=Z,m.backtrack=!0,m.globstar=!0,de(f);continue}let _=ke();if(t.noextglob!==!0&&/^\([^?]/.test(_)){It("star",f);continue}if(g.type==="star"){if(t.noglobstar===!0){de(f);continue}let y=g.prev,T=y.prev,G=y.type==="slash"||y.type==="bos",re=T&&(T.type==="star"||T.type==="globstar");if(t.bash===!0&&(!G||_[0]&&_[0]!=="/")){I({type:"star",value:f,output:""});continue}let K=m.braces>0&&(y.type==="comma"||y.type==="brace"),Cn=U.length&&(y.type==="pipe"||y.type==="paren");if(!G&&y.type!=="paren"&&!K&&!Cn){I({type:"star",value:f,output:""});continue}for(;_.slice(0,3)==="/**";){let Mt=o[m.index+4];if(Mt&&Mt!=="/")break;_=_.slice(3),de("/**",3)}if(y.type==="bos"&&se()){g.type="globstar",g.value+=f,g.output=oe(t),m.output=g.output,m.globstar=!0,de(f);continue}if(y.type==="slash"&&y.prev.type!=="bos"&&!re&&se()){m.output=m.output.slice(0,-(y.output+g.output).length),y.output=`(?:${y.output}`,g.type="globstar",g.output=oe(t)+(t.strictSlashes?")":"|$)"),g.value+=f,m.globstar=!0,m.output+=y.output+g.output,de(f);continue}if(y.type==="slash"&&y.prev.type!=="bos"&&_[0]==="/"){let Mt=_[1]!==void 0?"|$":"";m.output=m.output.slice(0,-(y.output+g.output).length),y.output=`(?:${y.output}`,g.type="globstar",g.output=`${oe(t)}${h}|${h}${Mt})`,g.value+=f,m.output+=y.output+g.output,m.globstar=!0,de(f+_e()),I({type:"slash",value:"/",output:""});continue}if(y.type==="bos"&&_[0]==="/"){g.type="globstar",g.value+=f,g.output=`(?:^|${h}|${oe(t)}${h})`,m.output=g.output,m.globstar=!0,de(f+_e()),I({type:"slash",value:"/",output:""});continue}m.output=m.output.slice(0,-g.output.length),g.type="globstar",g.output=oe(t),g.value+=f,m.output+=g.output,m.globstar=!0,de(f);continue}let j={type:"star",value:f,output:Z};if(t.bash===!0){j.output=".*?",(g.type==="bos"||g.type==="slash")&&(j.output=E+j.output),I(j);continue}if(g&&(g.type==="bracket"||g.type==="paren")&&t.regex===!0){j.output=f,I(j);continue}(m.index===m.start||g.type==="slash"||g.type==="dot")&&(g.type==="dot"?(m.output+=D,g.output+=D):t.dot===!0?(m.output+=x,g.output+=x):(m.output+=E,g.output+=E),$()!=="*"&&(m.output+=w,g.output+=w)),I(j)}for(;m.brackets>0;){if(t.strictBrackets===!0)throw new SyntaxError(ze("closing","]"));m.output=pe.escapeLast(m.output,"["),Be("brackets")}for(;m.parens>0;){if(t.strictBrackets===!0)throw new SyntaxError(ze("closing",")"));m.output=pe.escapeLast(m.output,"("),Be("parens")}for(;m.braces>0;){if(t.strictBrackets===!0)throw new SyntaxError(ze("closing","}"));m.output=pe.escapeLast(m.output,"{"),Be("braces")}if(t.strictSlashes!==!0&&(g.type==="star"||g.type==="bracket")&&I({type:"maybe_slash",value:"",output:`${h}?`}),m.backtrack===!0){m.output="";for(let _ of m.tokens)m.output+=_.output!=null?_.output:_.value,_.suffix&&(m.output+=_.suffix)}return m};Fn.fastpaths=(o,e)=>{let t={...e},s=typeof t.maxLength=="number"?Math.min(Nt,t.maxLength):Nt,n=o.length;if(n>s)throw new SyntaxError(`Input length: ${n}, exceeds maximum allowed length: ${s}`);o=gs[o]||o;let r=pe.isWindows(e),{DOT_LITERAL:i,SLASH_LITERAL:a,ONE_CHAR:c,DOTS_SLASH:l,NO_DOT:p,NO_DOTS:d,NO_DOTS_SLASH:u,STAR:h,START_ANCHOR:w}=Ht.globChars(r),v=t.dot?d:p,k=t.dot?u:p,D=t.capture?"":"?:",x={negated:!1,prefix:""},S=t.bash===!0?".*?":h;t.capture&&(S=`(${S})`);let V=E=>E.noglobstar===!0?S:`(${D}(?:(?!${w}${E.dot?l:i}).)*?)`,W=E=>{switch(E){case"*":return`${v}${c}${S}`;case".*":return`${i}${c}${S}`;case"*.*":return`${v}${S}${i}${c}${S}`;case"*/*":return`${v}${S}${a}${c}${k}${S}`;case"**":return v+V(t);case"**/*":return`(?:${v}${V(t)}${a})?${k}${c}${S}`;case"**/*.*":return`(?:${v}${V(t)}${a})?${k}${S}${i}${c}${S}`;case"**/.*":return`(?:${v}${V(t)}${a})?${i}${c}${S}`;default:{let B=/^(.*?)\.(\w+)$/.exec(E);if(!B)return;let Z=W(B[1]);return Z?Z+i+B[2]:void 0}}},he=pe.removePrefix(o,x),oe=W(he);return oe&&t.strictSlashes!==!0&&(oe+=`${a}?`),oe};fs.exports=Fn});var vs=H((ed,ws)=>{"use strict";var Ji=require("path"),Zi=hs(),Ln=ms(),Bn=Bt(),ea=ut(),ta=o=>o&&typeof o=="object"&&!Array.isArray(o),z=(o,e,t=!1)=>{if(Array.isArray(o)){let p=o.map(u=>z(u,e,t));return u=>{for(let h of p){let w=h(u);if(w)return w}return!1}}let s=ta(o)&&o.tokens&&o.input;if(o===""||typeof o!="string"&&!s)throw new TypeError("Expected pattern to be a non-empty string");let n=e||{},r=Bn.isWindows(e),i=s?z.compileRe(o,e):z.makeRe(o,e,!1,!0),a=i.state;delete i.state;let c=()=>!1;if(n.ignore){let p={...e,ignore:null,onMatch:null,onResult:null};c=z(n.ignore,p,t)}let l=(p,d=!1)=>{let{isMatch:u,match:h,output:w}=z.test(p,i,e,{glob:o,posix:r}),v={glob:o,state:a,regex:i,posix:r,input:p,output:w,match:h,isMatch:u};return typeof n.onResult=="function"&&n.onResult(v),u===!1?(v.isMatch=!1,d?v:!1):c(p)?(typeof n.onIgnore=="function"&&n.onIgnore(v),v.isMatch=!1,d?v:!1):(typeof n.onMatch=="function"&&n.onMatch(v),d?v:!0)};return t&&(l.state=a),l};z.test=(o,e,t,{glob:s,posix:n}={})=>{if(typeof o!="string")throw new TypeError("Expected input to be a string");if(o==="")return{isMatch:!1,output:""};let r=t||{},i=r.format||(n?Bn.toPosixSlashes:null),a=o===s,c=a&&i?i(o):o;return a===!1&&(c=i?i(o):o,a=c===s),(a===!1||r.capture===!0)&&(r.matchBase===!0||r.basename===!0?a=z.matchBase(o,e,t,n):a=e.exec(c)),{isMatch:!!a,match:a,output:c}};z.matchBase=(o,e,t,s=Bn.isWindows(t))=>(e instanceof RegExp?e:z.makeRe(e,t)).test(Ji.basename(o));z.isMatch=(o,e,t)=>z(e,t)(o);z.parse=(o,e)=>Array.isArray(o)?o.map(t=>z.parse(t,e)):Ln(o,{...e,fastpaths:!1});z.scan=(o,e)=>Zi(o,e);z.compileRe=(o,e,t=!1,s=!1)=>{if(t===!0)return o.output;let n=e||{},r=n.contains?"":"^",i=n.contains?"":"$",a=`${r}(?:${o.output})${i}`;o&&o.negated===!0&&(a=`^(?!${a}).*$`);let c=z.toRegex(a,e);return s===!0&&(c.state=o),c};z.makeRe=(o,e={},t=!1,s=!1)=>{if(!o||typeof o!="string")throw new TypeError("Expected a non-empty string");let n={negated:!1,fastpaths:!0};return e.fastpaths!==!1&&(o[0]==="."||o[0]==="*")&&(n.output=Ln.fastpaths(o,e)),n.output||(n=Ln(o,e)),z.compileRe(n,e,t,s)};z.toRegex=(o,e)=>{try{let t=e||{};return new RegExp(o,t.flags||(t.nocase?"i":""))}catch(t){if(e&&e.debug===!0)throw t;return/$^/}};z.constants=ea;ws.exports=z});var Hn=H((td,ys)=>{"use strict";ys.exports=vs()});var Rs=H((nd,Ss)=>{"use strict";var ft=require("fs"),{Readable:na}=require("stream"),gt=require("path"),{promisify:Ut}=require("util"),Nn=Hn(),oa=Ut(ft.readdir),sa=Ut(ft.stat),_s=Ut(ft.lstat),ra=Ut(ft.realpath),ia="!",Cs="READDIRP_RECURSIVE_ERROR",aa=new Set(["ENOENT","EPERM","EACCES","ELOOP",Cs]),On="files",Ps="directories",jt="files_directories",Ot="all",ks=[On,Ps,jt,Ot],ca=o=>aa.has(o.code),[bs,la]=process.versions.node.split(".").slice(0,2).map(o=>Number.parseInt(o,10)),da=process.platform==="win32"&&(bs>10||bs===10&&la>=5),xs=o=>{if(o!==void 0){if(typeof o=="function")return o;if(typeof o=="string"){let e=Nn(o.trim());return t=>e(t.basename)}if(Array.isArray(o)){let e=[],t=[];for(let s of o){let n=s.trim();n.charAt(0)===ia?t.push(Nn(n.slice(1))):e.push(Nn(n))}return t.length>0?e.length>0?s=>e.some(n=>n(s.basename))&&!t.some(n=>n(s.basename)):s=>!t.some(n=>n(s.basename)):s=>e.some(n=>n(s.basename))}}},Wt=class o extends na{static get defaultOptions(){return{root:".",fileFilter:e=>!0,directoryFilter:e=>!0,type:On,lstat:!1,depth:2147483648,alwaysStat:!1}}constructor(e={}){super({objectMode:!0,autoDestroy:!0,highWaterMark:e.highWaterMark||4096});let t={...o.defaultOptions,...e},{root:s,type:n}=t;this._fileFilter=xs(t.fileFilter),this._directoryFilter=xs(t.directoryFilter);let r=t.lstat?_s:sa;da?this._stat=i=>r(i,{bigint:!0}):this._stat=r,this._maxDepth=t.depth,this._wantsDir=[Ps,jt,Ot].includes(n),this._wantsFile=[On,jt,Ot].includes(n),this._wantsEverything=n===Ot,this._root=gt.resolve(s),this._isDirent="Dirent"in ft&&!t.alwaysStat,this._statsProp=this._isDirent?"dirent":"stats",this._rdOptions={encoding:"utf8",withFileTypes:this._isDirent},this.parents=[this._exploreDir(s,1)],this.reading=!1,this.parent=void 0}async _read(e){if(!this.reading){this.reading=!0;try{for(;!this.destroyed&&e>0;){let{path:t,depth:s,files:n=[]}=this.parent||{};if(n.length>0){let r=n.splice(0,e).map(i=>this._formatEntry(i,t));for(let i of await Promise.all(r)){if(this.destroyed)return;let a=await this._getEntryType(i);a==="directory"&&this._directoryFilter(i)?(s<=this._maxDepth&&this.parents.push(this._exploreDir(i.fullPath,s+1)),this._wantsDir&&(this.push(i),e--)):(a==="file"||this._includeAsFile(i))&&this._fileFilter(i)&&this._wantsFile&&(this.push(i),e--)}}else{let r=this.parents.pop();if(!r){this.push(null);break}if(this.parent=await r,this.destroyed)return}}}catch(t){this.destroy(t)}finally{this.reading=!1}}}async _exploreDir(e,t){let s;try{s=await oa(e,this._rdOptions)}catch(n){this._onError(n)}return{files:s,depth:t,path:e}}async _formatEntry(e,t){let s;try{let n=this._isDirent?e.name:e,r=gt.resolve(gt.join(t,n));s={path:gt.relative(this._root,r),fullPath:r,basename:n},s[this._statsProp]=this._isDirent?e:await this._stat(r)}catch(n){this._onError(n)}return s}_onError(e){ca(e)&&!this.destroyed?this.emit("warn",e):this.destroy(e)}async _getEntryType(e){let t=e&&e[this._statsProp];if(t){if(t.isFile())return"file";if(t.isDirectory())return"directory";if(t&&t.isSymbolicLink()){let s=e.fullPath;try{let n=await ra(s),r=await _s(n);if(r.isFile())return"file";if(r.isDirectory()){let i=n.length;if(s.startsWith(n)&&s.substr(i,1)===gt.sep){let a=new Error(`Circular symlink detected: "${s}" points to "${n}"`);return a.code=Cs,this._onError(a)}return"directory"}}catch(n){this._onError(n)}}}}_includeAsFile(e){let t=e&&e[this._statsProp];return t&&this._wantsEverything&&!t.isDirectory()}},Ke=(o,e={})=>{let t=e.entryType||e.type;if(t==="both"&&(t=jt),t&&(e.type=t),o){if(typeof o!="string")throw new TypeError("readdirp: root argument must be a string. Usage: readdirp(root, options)");if(t&&!ks.includes(t))throw new Error(`readdirp: Invalid type passed. Use one of ${ks.join(", ")}`)}else throw new Error("readdirp: root argument is required. Usage: readdirp(root, options)");return e.root=o,new Wt(e)},pa=(o,e={})=>new Promise((t,s)=>{let n=[];Ke(o,e).on("data",r=>n.push(r)).on("end",()=>t(n)).on("error",r=>s(r))});Ke.promise=pa;Ke.ReaddirpStream=Wt;Ke.default=Ke;Ss.exports=Ke});var jn=H((od,Es)=>{Es.exports=function(o,e){if(typeof o!="string")throw new TypeError("expected path to be a string");if(o==="\\"||o==="/")return"/";var t=o.length;if(t<=1)return o;var s="";if(t>4&&o[3]==="\\"){var n=o[2];(n==="?"||n===".")&&o.slice(0,2)==="\\\\"&&(o=o.slice(2),s="//")}var r=o.split(/[/\\]+/);return e!==!1&&r[r.length-1]===""&&r.pop(),s+r.join("/")}});var Ds=H((Ms,$s)=>{"use strict";Object.defineProperty(Ms,"__esModule",{value:!0});var Is=Hn(),ua=jn(),Ts="!",ha={returnIndex:!1},ga=o=>Array.isArray(o)?o:[o],fa=(o,e)=>{if(typeof o=="function")return o;if(typeof o=="string"){let t=Is(o,e);return s=>o===s||t(s)}return o instanceof RegExp?t=>o.test(t):t=>!1},As=(o,e,t,s)=>{let n=Array.isArray(t),r=n?t[0]:t;if(!n&&typeof r!="string")throw new TypeError("anymatch: second argument must be a string: got "+Object.prototype.toString.call(r));let i=ua(r,!1);for(let c=0;c<e.length;c++){let l=e[c];if(l(i))return s?-1:!1}let a=n&&[i].concat(t.slice(1));for(let c=0;c<o.length;c++){let l=o[c];if(n?l(...a):l(i))return s?c:!0}return s?-1:!1},Wn=(o,e,t=ha)=>{if(o==null)throw new TypeError("anymatch: specify first argument");let s=typeof t=="boolean"?{returnIndex:t}:t,n=s.returnIndex||!1,r=ga(o),i=r.filter(c=>typeof c=="string"&&c.charAt(0)===Ts).map(c=>c.slice(1)).map(c=>Is(c,s)),a=r.filter(c=>typeof c!="string"||typeof c=="string"&&c.charAt(0)!==Ts).map(c=>fa(c,s));return e==null?(c,l=!1)=>As(a,i,c,typeof l=="boolean"?l:!1):As(a,i,e,n)};Wn.default=Wn;$s.exports=Wn});var Ls=H((sd,Fs)=>{Fs.exports=function(e){if(typeof e!="string"||e==="")return!1;for(var t;t=/(\\).|([@?!+*]\(.*\))/g.exec(e);){if(t[2])return!0;e=e.slice(t.index+t[0].length)}return!1}});var Un=H((rd,Hs)=>{var ma=Ls(),Bs={"{":"}","(":")","[":"]"},wa=function(o){if(o[0]==="!")return!0;for(var e=0,t=-2,s=-2,n=-2,r=-2,i=-2;e<o.length;){if(o[e]==="*"||o[e+1]==="?"&&/[\].+)]/.test(o[e])||s!==-1&&o[e]==="["&&o[e+1]!=="]"&&(s<e&&(s=o.indexOf("]",e)),s>e&&(i===-1||i>s||(i=o.indexOf("\\",e),i===-1||i>s)))||n!==-1&&o[e]==="{"&&o[e+1]!=="}"&&(n=o.indexOf("}",e),n>e&&(i=o.indexOf("\\",e),i===-1||i>n))||r!==-1&&o[e]==="("&&o[e+1]==="?"&&/[:!=]/.test(o[e+2])&&o[e+3]!==")"&&(r=o.indexOf(")",e),r>e&&(i=o.indexOf("\\",e),i===-1||i>r))||t!==-1&&o[e]==="("&&o[e+1]!=="|"&&(t<e&&(t=o.indexOf("|",e)),t!==-1&&o[t+1]!==")"&&(r=o.indexOf(")",t),r>t&&(i=o.indexOf("\\",t),i===-1||i>r))))return!0;if(o[e]==="\\"){var a=o[e+1];e+=2;var c=Bs[a];if(c){var l=o.indexOf(c,e);l!==-1&&(e=l+1)}if(o[e]==="!")return!0}else e++}return!1},va=function(o){if(o[0]==="!")return!0;for(var e=0;e<o.length;){if(/[*?{}()[\]]/.test(o[e]))return!0;if(o[e]==="\\"){var t=o[e+1];e+=2;var s=Bs[t];if(s){var n=o.indexOf(s,e);n!==-1&&(e=n+1)}if(o[e]==="!")return!0}else e++}return!1};Hs.exports=function(e,t){if(typeof e!="string"||e==="")return!1;if(ma(e))return!0;var s=wa;return t&&t.strict===!1&&(s=va),s(e)}});var Os=H((id,Ns)=>{"use strict";var ya=Un(),_a=require("path").posix.dirname,ka=require("os").platform()==="win32",qn="/",ba=/\\/g,xa=/[\{\[].*[\}\]]$/,Ca=/(^|[^\\])([\{\[]|\([^\)]+$)/,Pa=/\\([\!\*\?\|\[\]\(\)\{\}])/g;Ns.exports=function(e,t){var s=Object.assign({flipBackslashes:!0},t);s.flipBackslashes&&ka&&e.indexOf(qn)<0&&(e=e.replace(ba,qn)),xa.test(e)&&(e+=qn),e+="a";do e=_a(e);while(ya(e)||Ca.test(e));return e.replace(Pa,"$1")}});var qt=H(fe=>{"use strict";fe.isInteger=o=>typeof o=="number"?Number.isInteger(o):typeof o=="string"&&o.trim()!==""?Number.isInteger(Number(o)):!1;fe.find=(o,e)=>o.nodes.find(t=>t.type===e);fe.exceedsLimit=(o,e,t=1,s)=>s===!1||!fe.isInteger(o)||!fe.isInteger(e)?!1:(Number(e)-Number(o))/Number(t)>=s;fe.escapeNode=(o,e=0,t)=>{let s=o.nodes[e];s&&(t&&s.type===t||s.type==="open"||s.type==="close")&&s.escaped!==!0&&(s.value="\\"+s.value,s.escaped=!0)};fe.encloseBrace=o=>o.type!=="brace"?!1:o.commas>>0+o.ranges>>0===0?(o.invalid=!0,!0):!1;fe.isInvalidBrace=o=>o.type!=="brace"?!1:o.invalid===!0||o.dollar?!0:o.commas>>0+o.ranges>>0===0||o.open!==!0||o.close!==!0?(o.invalid=!0,!0):!1;fe.isOpenOrClose=o=>o.type==="open"||o.type==="close"?!0:o.open===!0||o.close===!0;fe.reduce=o=>o.reduce((e,t)=>(t.type==="text"&&e.push(t.value),t.type==="range"&&(t.type="text"),e),[]);fe.flatten=(...o)=>{let e=[],t=s=>{for(let n=0;n<s.length;n++){let r=s[n];if(Array.isArray(r)){t(r);continue}r!==void 0&&e.push(r)}return e};return t(o),e}});var Gt=H((cd,Ws)=>{"use strict";var js=qt();Ws.exports=(o,e={})=>{let t=(s,n={})=>{let r=e.escapeInvalid&&js.isInvalidBrace(n),i=s.invalid===!0&&e.escapeInvalid===!0,a="";if(s.value)return(r||i)&&js.isOpenOrClose(s)?"\\"+s.value:s.value;if(s.value)return s.value;if(s.nodes)for(let c of s.nodes)a+=t(c);return a};return t(o)}});var qs=H((ld,Us)=>{"use strict";Us.exports=function(o){return typeof o=="number"?o-o===0:typeof o=="string"&&o.trim()!==""?Number.isFinite?Number.isFinite(+o):isFinite(+o):!1}});var Zs=H((dd,Js)=>{"use strict";var Gs=qs(),Ne=(o,e,t)=>{if(Gs(o)===!1)throw new TypeError("toRegexRange: expected the first argument to be a number");if(e===void 0||o===e)return String(o);if(Gs(e)===!1)throw new TypeError("toRegexRange: expected the second argument to be a number.");let s={relaxZeros:!0,...t};typeof s.strictZeros=="boolean"&&(s.relaxZeros=s.strictZeros===!1);let n=String(s.relaxZeros),r=String(s.shorthand),i=String(s.capture),a=String(s.wrap),c=o+":"+e+"="+n+r+i+a;if(Ne.cache.hasOwnProperty(c))return Ne.cache[c].result;let l=Math.min(o,e),p=Math.max(o,e);if(Math.abs(l-p)===1){let v=o+"|"+e;return s.capture?`(${v})`:s.wrap===!1?v:`(?:${v})`}let d=Xs(o)||Xs(e),u={min:o,max:e,a:l,b:p},h=[],w=[];if(d&&(u.isPadded=d,u.maxLen=String(u.max).length),l<0){let v=p<0?Math.abs(p):1;w=Vs(v,Math.abs(l),u,s),l=u.a=0}return p>=0&&(h=Vs(l,p,u,s)),u.negatives=w,u.positives=h,u.result=Sa(w,h,s),s.capture===!0?u.result=`(${u.result})`:s.wrap!==!1&&h.length+w.length>1&&(u.result=`(?:${u.result})`),Ne.cache[c]=u,u.result};function Sa(o,e,t){let s=Gn(o,e,"-",!1,t)||[],n=Gn(e,o,"",!1,t)||[],r=Gn(o,e,"-?",!0,t)||[];return s.concat(r).concat(n).join("|")}function Ra(o,e){let t=1,s=1,n=Ks(o,t),r=new Set([e]);for(;o<=n&&n<=e;)r.add(n),t+=1,n=Ks(o,t);for(n=Ys(e+1,s)-1;o<n&&n<=e;)r.add(n),s+=1,n=Ys(e+1,s)-1;return r=[...r],r.sort(Aa),r}function Ea(o,e,t){if(o===e)return{pattern:o,count:[],digits:0};let s=Ta(o,e),n=s.length,r="",i=0;for(let a=0;a<n;a++){let[c,l]=s[a];c===l?r+=c:c!=="0"||l!=="9"?r+=Ia(c,l,t):i++}return i&&(r+=t.shorthand===!0?"\\d":"[0-9]"),{pattern:r,count:[i],digits:n}}function Vs(o,e,t,s){let n=Ra(o,e),r=[],i=o,a;for(let c=0;c<n.length;c++){let l=n[c],p=Ea(String(i),String(l),s),d="";if(!t.isPadded&&a&&a.pattern===p.pattern){a.count.length>1&&a.count.pop(),a.count.push(p.count[0]),a.string=a.pattern+Qs(a.count),i=l+1;continue}t.isPadded&&(d=Ma(l,t,s)),p.string=d+p.pattern+Qs(p.count),r.push(p),i=l+1,a=p}return r}function Gn(o,e,t,s,n){let r=[];for(let i of o){let{string:a}=i;!s&&!zs(e,"string",a)&&r.push(t+a),s&&zs(e,"string",a)&&r.push(t+a)}return r}function Ta(o,e){let t=[];for(let s=0;s<o.length;s++)t.push([o[s],e[s]]);return t}function Aa(o,e){return o>e?1:e>o?-1:0}function zs(o,e,t){return o.some(s=>s[e]===t)}function Ks(o,e){return Number(String(o).slice(0,-e)+"9".repeat(e))}function Ys(o,e){return o-o%Math.pow(10,e)}function Qs(o){let[e=0,t=""]=o;return t||e>1?`{${e+(t?","+t:"")}}`:""}function Ia(o,e,t){return`[${o}${e-o===1?"":"-"}${e}]`}function Xs(o){return/^-?(0+)\d/.test(o)}function Ma(o,e,t){if(!e.isPadded)return o;let s=Math.abs(e.maxLen-String(o).length),n=t.relaxZeros!==!1;switch(s){case 0:return"";case 1:return n?"0?":"0";case 2:return n?"0{0,2}":"00";default:return n?`0{0,${s}}`:`0{${s}}`}}Ne.cache={};Ne.clearCache=()=>Ne.cache={};Js.exports=Ne});var Kn=H((pd,ir)=>{"use strict";var $a=require("util"),tr=Zs(),er=o=>o!==null&&typeof o=="object"&&!Array.isArray(o),Da=o=>e=>o===!0?Number(e):String(e),Vn=o=>typeof o=="number"||typeof o=="string"&&o!=="",mt=o=>Number.isInteger(+o),zn=o=>{let e=`${o}`,t=-1;if(e[0]==="-"&&(e=e.slice(1)),e==="0")return!1;for(;e[++t]==="0";);return t>0},Fa=(o,e,t)=>typeof o=="string"||typeof e=="string"?!0:t.stringify===!0,La=(o,e,t)=>{if(e>0){let s=o[0]==="-"?"-":"";s&&(o=o.slice(1)),o=s+o.padStart(s?e-1:e,"0")}return t===!1?String(o):o},zt=(o,e)=>{let t=o[0]==="-"?"-":"";for(t&&(o=o.slice(1),e--);o.length<e;)o="0"+o;return t?"-"+o:o},Ba=(o,e,t)=>{o.negatives.sort((a,c)=>a<c?-1:a>c?1:0),o.positives.sort((a,c)=>a<c?-1:a>c?1:0);let s=e.capture?"":"?:",n="",r="",i;return o.positives.length&&(n=o.positives.map(a=>zt(String(a),t)).join("|")),o.negatives.length&&(r=`-(${s}${o.negatives.map(a=>zt(String(a),t)).join("|")})`),n&&r?i=`${n}|${r}`:i=n||r,e.wrap?`(${s}${i})`:i},nr=(o,e,t,s)=>{if(t)return tr(o,e,{wrap:!1,...s});let n=String.fromCharCode(o);if(o===e)return n;let r=String.fromCharCode(e);return`[${n}-${r}]`},or=(o,e,t)=>{if(Array.isArray(o)){let s=t.wrap===!0,n=t.capture?"":"?:";return s?`(${n}${o.join("|")})`:o.join("|")}return tr(o,e,t)},sr=(...o)=>new RangeError("Invalid range arguments: "+$a.inspect(...o)),rr=(o,e,t)=>{if(t.strictRanges===!0)throw sr([o,e]);return[]},Ha=(o,e)=>{if(e.strictRanges===!0)throw new TypeError(`Expected step "${o}" to be a number`);return[]},Na=(o,e,t=1,s={})=>{let n=Number(o),r=Number(e);if(!Number.isInteger(n)||!Number.isInteger(r)){if(s.strictRanges===!0)throw sr([o,e]);return[]}n===0&&(n=0),r===0&&(r=0);let i=n>r,a=String(o),c=String(e),l=String(t);t=Math.max(Math.abs(t),1);let p=zn(a)||zn(c)||zn(l),d=p?Math.max(a.length,c.length,l.length):0,u=p===!1&&Fa(o,e,s)===!1,h=s.transform||Da(u);if(s.toRegex&&t===1)return nr(zt(o,d),zt(e,d),!0,s);let w={negatives:[],positives:[]},v=x=>w[x<0?"negatives":"positives"].push(Math.abs(x)),k=[],D=0;for(;i?n>=r:n<=r;)s.toRegex===!0&&t>1?v(n):k.push(La(h(n,D),d,u)),n=i?n-t:n+t,D++;return s.toRegex===!0?t>1?Ba(w,s,d):or(k,null,{wrap:!1,...s}):k},Oa=(o,e,t=1,s={})=>{if(!mt(o)&&o.length>1||!mt(e)&&e.length>1)return rr(o,e,s);let n=s.transform||(u=>String.fromCharCode(u)),r=`${o}`.charCodeAt(0),i=`${e}`.charCodeAt(0),a=r>i,c=Math.min(r,i),l=Math.max(r,i);if(s.toRegex&&t===1)return nr(c,l,!1,s);let p=[],d=0;for(;a?r>=i:r<=i;)p.push(n(r,d)),r=a?r-t:r+t,d++;return s.toRegex===!0?or(p,null,{wrap:!1,options:s}):p},Vt=(o,e,t,s={})=>{if(e==null&&Vn(o))return[o];if(!Vn(o)||!Vn(e))return rr(o,e,s);if(typeof t=="function")return Vt(o,e,1,{transform:t});if(er(t))return Vt(o,e,0,t);let n={...s};return n.capture===!0&&(n.wrap=!0),t=t||n.step||1,mt(t)?mt(o)&&mt(e)?Na(o,e,t,n):Oa(o,e,Math.max(Math.abs(t),1),n):t!=null&&!er(t)?Ha(t,n):Vt(o,e,1,t)};ir.exports=Vt});var lr=H((ud,cr)=>{"use strict";var ja=Kn(),ar=qt(),Wa=(o,e={})=>{let t=(s,n={})=>{let r=ar.isInvalidBrace(n),i=s.invalid===!0&&e.escapeInvalid===!0,a=r===!0||i===!0,c=e.escapeInvalid===!0?"\\":"",l="";if(s.isOpen===!0)return c+s.value;if(s.isClose===!0)return console.log("node.isClose",c,s.value),c+s.value;if(s.type==="open")return a?c+s.value:"(";if(s.type==="close")return a?c+s.value:")";if(s.type==="comma")return s.prev.type==="comma"?"":a?s.value:"|";if(s.value)return s.value;if(s.nodes&&s.ranges>0){let p=ar.reduce(s.nodes),d=ja(...p,{...e,wrap:!1,toRegex:!0,strictZeros:!0});if(d.length!==0)return p.length>1&&d.length>1?`(${d})`:d}if(s.nodes)for(let p of s.nodes)l+=t(p,s);return l};return t(o)};cr.exports=Wa});var ur=H((hd,pr)=>{"use strict";var Ua=Kn(),dr=Gt(),Ye=qt(),Oe=(o="",e="",t=!1)=>{let s=[];if(o=[].concat(o),e=[].concat(e),!e.length)return o;if(!o.length)return t?Ye.flatten(e).map(n=>`{${n}}`):e;for(let n of o)if(Array.isArray(n))for(let r of n)s.push(Oe(r,e,t));else for(let r of e)t===!0&&typeof r=="string"&&(r=`{${r}}`),s.push(Array.isArray(r)?Oe(n,r,t):n+r);return Ye.flatten(s)},qa=(o,e={})=>{let t=e.rangeLimit===void 0?1e3:e.rangeLimit,s=(n,r={})=>{n.queue=[];let i=r,a=r.queue;for(;i.type!=="brace"&&i.type!=="root"&&i.parent;)i=i.parent,a=i.queue;if(n.invalid||n.dollar){a.push(Oe(a.pop(),dr(n,e)));return}if(n.type==="brace"&&n.invalid!==!0&&n.nodes.length===2){a.push(Oe(a.pop(),["{}"]));return}if(n.nodes&&n.ranges>0){let d=Ye.reduce(n.nodes);if(Ye.exceedsLimit(...d,e.step,t))throw new RangeError("expanded array length exceeds range limit. Use options.rangeLimit to increase or disable the limit.");let u=Ua(...d,e);u.length===0&&(u=dr(n,e)),a.push(Oe(a.pop(),u)),n.nodes=[];return}let c=Ye.encloseBrace(n),l=n.queue,p=n;for(;p.type!=="brace"&&p.type!=="root"&&p.parent;)p=p.parent,l=p.queue;for(let d=0;d<n.nodes.length;d++){let u=n.nodes[d];if(u.type==="comma"&&n.type==="brace"){d===1&&l.push(""),l.push("");continue}if(u.type==="close"){a.push(Oe(a.pop(),l,c));continue}if(u.value&&u.type!=="open"){l.push(Oe(l.pop(),u.value));continue}u.nodes&&s(u,n)}return l};return Ye.flatten(s(o))};pr.exports=qa});var gr=H((gd,hr)=>{"use strict";hr.exports={MAX_LENGTH:1e4,CHAR_0:"0",CHAR_9:"9",CHAR_UPPERCASE_A:"A",CHAR_LOWERCASE_A:"a",CHAR_UPPERCASE_Z:"Z",CHAR_LOWERCASE_Z:"z",CHAR_LEFT_PARENTHESES:"(",CHAR_RIGHT_PARENTHESES:")",CHAR_ASTERISK:"*",CHAR_AMPERSAND:"&",CHAR_AT:"@",CHAR_BACKSLASH:"\\",CHAR_BACKTICK:"`",CHAR_CARRIAGE_RETURN:"\r",CHAR_CIRCUMFLEX_ACCENT:"^",CHAR_COLON:":",CHAR_COMMA:",",CHAR_DOLLAR:"$",CHAR_DOT:".",CHAR_DOUBLE_QUOTE:'"',CHAR_EQUAL:"=",CHAR_EXCLAMATION_MARK:"!",CHAR_FORM_FEED:"\f",CHAR_FORWARD_SLASH:"/",CHAR_HASH:"#",CHAR_HYPHEN_MINUS:"-",CHAR_LEFT_ANGLE_BRACKET:"<",CHAR_LEFT_CURLY_BRACE:"{",CHAR_LEFT_SQUARE_BRACKET:"[",CHAR_LINE_FEED:`
`,CHAR_NO_BREAK_SPACE:"\xA0",CHAR_PERCENT:"%",CHAR_PLUS:"+",CHAR_QUESTION_MARK:"?",CHAR_RIGHT_ANGLE_BRACKET:">",CHAR_RIGHT_CURLY_BRACE:"}",CHAR_RIGHT_SQUARE_BRACKET:"]",CHAR_SEMICOLON:";",CHAR_SINGLE_QUOTE:"'",CHAR_SPACE:" ",CHAR_TAB:"	",CHAR_UNDERSCORE:"_",CHAR_VERTICAL_LINE:"|",CHAR_ZERO_WIDTH_NOBREAK_SPACE:"\uFEFF"}});var yr=H((fd,vr)=>{"use strict";var Ga=Gt(),{MAX_LENGTH:fr,CHAR_BACKSLASH:Yn,CHAR_BACKTICK:Va,CHAR_COMMA:za,CHAR_DOT:Ka,CHAR_LEFT_PARENTHESES:Ya,CHAR_RIGHT_PARENTHESES:Qa,CHAR_LEFT_CURLY_BRACE:Xa,CHAR_RIGHT_CURLY_BRACE:Ja,CHAR_LEFT_SQUARE_BRACKET:mr,CHAR_RIGHT_SQUARE_BRACKET:wr,CHAR_DOUBLE_QUOTE:Za,CHAR_SINGLE_QUOTE:ec,CHAR_NO_BREAK_SPACE:tc,CHAR_ZERO_WIDTH_NOBREAK_SPACE:nc}=gr(),oc=(o,e={})=>{if(typeof o!="string")throw new TypeError("Expected a string");let t=e||{},s=typeof t.maxLength=="number"?Math.min(fr,t.maxLength):fr;if(o.length>s)throw new SyntaxError(`Input length (${o.length}), exceeds max characters (${s})`);let n={type:"root",input:o,nodes:[]},r=[n],i=n,a=n,c=0,l=o.length,p=0,d=0,u,h=()=>o[p++],w=v=>{if(v.type==="text"&&a.type==="dot"&&(a.type="text"),a&&a.type==="text"&&v.type==="text"){a.value+=v.value;return}return i.nodes.push(v),v.parent=i,v.prev=a,a=v,v};for(w({type:"bos"});p<l;)if(i=r[r.length-1],u=h(),!(u===nc||u===tc)){if(u===Yn){w({type:"text",value:(e.keepEscaping?u:"")+h()});continue}if(u===wr){w({type:"text",value:"\\"+u});continue}if(u===mr){c++;let v;for(;p<l&&(v=h());){if(u+=v,v===mr){c++;continue}if(v===Yn){u+=h();continue}if(v===wr&&(c--,c===0))break}w({type:"text",value:u});continue}if(u===Ya){i=w({type:"paren",nodes:[]}),r.push(i),w({type:"text",value:u});continue}if(u===Qa){if(i.type!=="paren"){w({type:"text",value:u});continue}i=r.pop(),w({type:"text",value:u}),i=r[r.length-1];continue}if(u===Za||u===ec||u===Va){let v=u,k;for(e.keepQuotes!==!0&&(u="");p<l&&(k=h());){if(k===Yn){u+=k+h();continue}if(k===v){e.keepQuotes===!0&&(u+=k);break}u+=k}w({type:"text",value:u});continue}if(u===Xa){d++;let k={type:"brace",open:!0,close:!1,dollar:a.value&&a.value.slice(-1)==="$"||i.dollar===!0,depth:d,commas:0,ranges:0,nodes:[]};i=w(k),r.push(i),w({type:"open",value:u});continue}if(u===Ja){if(i.type!=="brace"){w({type:"text",value:u});continue}let v="close";i=r.pop(),i.close=!0,w({type:v,value:u}),d--,i=r[r.length-1];continue}if(u===za&&d>0){if(i.ranges>0){i.ranges=0;let v=i.nodes.shift();i.nodes=[v,{type:"text",value:Ga(i)}]}w({type:"comma",value:u}),i.commas++;continue}if(u===Ka&&d>0&&i.commas===0){let v=i.nodes;if(d===0||v.length===0){w({type:"text",value:u});continue}if(a.type==="dot"){if(i.range=[],a.value+=u,a.type="range",i.nodes.length!==3&&i.nodes.length!==5){i.invalid=!0,i.ranges=0,a.type="text";continue}i.ranges++,i.args=[];continue}if(a.type==="range"){v.pop();let k=v[v.length-1];k.value+=a.value+u,a=k,i.ranges--;continue}w({type:"dot",value:u});continue}w({type:"text",value:u})}do if(i=r.pop(),i.type!=="root"){i.nodes.forEach(D=>{D.nodes||(D.type==="open"&&(D.isOpen=!0),D.type==="close"&&(D.isClose=!0),D.nodes||(D.type="text"),D.invalid=!0)});let v=r[r.length-1],k=v.nodes.indexOf(i);v.nodes.splice(k,1,...i.nodes)}while(r.length>0);return w({type:"eos"}),n};vr.exports=oc});var br=H((md,kr)=>{"use strict";var _r=Gt(),sc=lr(),rc=ur(),ic=yr(),ue=(o,e={})=>{let t=[];if(Array.isArray(o))for(let s of o){let n=ue.create(s,e);Array.isArray(n)?t.push(...n):t.push(n)}else t=[].concat(ue.create(o,e));return e&&e.expand===!0&&e.nodupes===!0&&(t=[...new Set(t)]),t};ue.parse=(o,e={})=>ic(o,e);ue.stringify=(o,e={})=>_r(typeof o=="string"?ue.parse(o,e):o,e);ue.compile=(o,e={})=>(typeof o=="string"&&(o=ue.parse(o,e)),sc(o,e));ue.expand=(o,e={})=>{typeof o=="string"&&(o=ue.parse(o,e));let t=rc(o,e);return e.noempty===!0&&(t=t.filter(Boolean)),e.nodupes===!0&&(t=[...new Set(t)]),t};ue.create=(o,e={})=>o===""||o.length<3?[o]:e.expand!==!0?ue.compile(o,e):ue.expand(o,e);kr.exports=ue});var xr=H((wd,ac)=>{ac.exports=["3dm","3ds","3g2","3gp","7z","a","aac","adp","afdesign","afphoto","afpub","ai","aif","aiff","alz","ape","apk","appimage","ar","arj","asf","au","avi","bak","baml","bh","bin","bk","bmp","btif","bz2","bzip2","cab","caf","cgm","class","cmx","cpio","cr2","cur","dat","dcm","deb","dex","djvu","dll","dmg","dng","doc","docm","docx","dot","dotm","dra","DS_Store","dsk","dts","dtshd","dvb","dwg","dxf","ecelp4800","ecelp7470","ecelp9600","egg","eol","eot","epub","exe","f4v","fbs","fh","fla","flac","flatpak","fli","flv","fpx","fst","fvt","g3","gh","gif","graffle","gz","gzip","h261","h263","h264","icns","ico","ief","img","ipa","iso","jar","jpeg","jpg","jpgv","jpm","jxr","key","ktx","lha","lib","lvp","lz","lzh","lzma","lzo","m3u","m4a","m4v","mar","mdi","mht","mid","midi","mj2","mka","mkv","mmr","mng","mobi","mov","movie","mp3","mp4","mp4a","mpeg","mpg","mpga","mxu","nef","npx","numbers","nupkg","o","odp","ods","odt","oga","ogg","ogv","otf","ott","pages","pbm","pcx","pdb","pdf","pea","pgm","pic","png","pnm","pot","potm","potx","ppa","ppam","ppm","pps","ppsm","ppsx","ppt","pptm","pptx","psd","pya","pyc","pyo","pyv","qt","rar","ras","raw","resources","rgb","rip","rlc","rmf","rmvb","rpm","rtf","rz","s3m","s7z","scpt","sgi","shar","snap","sil","sketch","slk","smv","snk","so","stl","suo","sub","swf","tar","tbz","tbz2","tga","tgz","thmx","tif","tiff","tlz","ttc","ttf","txz","udf","uvh","uvi","uvm","uvp","uvs","uvu","viv","vob","war","wav","wax","wbmp","wdp","weba","webm","webp","whl","wim","wm","wma","wmv","wmx","woff","woff2","wrm","wvx","xbm","xif","xla","xlam","xls","xlsb","xlsm","xlsx","xlt","xltm","xltx","xm","xmind","xpi","xpm","xwd","xz","z","zip","zipx"]});var Pr=H((vd,Cr)=>{Cr.exports=xr()});var Rr=H((yd,Sr)=>{"use strict";var cc=require("path"),lc=Pr(),dc=new Set(lc);Sr.exports=o=>dc.has(cc.extname(o).slice(1).toLowerCase())});var Kt=H(b=>{"use strict";var{sep:pc}=require("path"),{platform:Qn}=process,uc=require("os");b.EV_ALL="all";b.EV_READY="ready";b.EV_ADD="add";b.EV_CHANGE="change";b.EV_ADD_DIR="addDir";b.EV_UNLINK="unlink";b.EV_UNLINK_DIR="unlinkDir";b.EV_RAW="raw";b.EV_ERROR="error";b.STR_DATA="data";b.STR_END="end";b.STR_CLOSE="close";b.FSEVENT_CREATED="created";b.FSEVENT_MODIFIED="modified";b.FSEVENT_DELETED="deleted";b.FSEVENT_MOVED="moved";b.FSEVENT_CLONED="cloned";b.FSEVENT_UNKNOWN="unknown";b.FSEVENT_FLAG_MUST_SCAN_SUBDIRS=1;b.FSEVENT_TYPE_FILE="file";b.FSEVENT_TYPE_DIRECTORY="directory";b.FSEVENT_TYPE_SYMLINK="symlink";b.KEY_LISTENERS="listeners";b.KEY_ERR="errHandlers";b.KEY_RAW="rawEmitters";b.HANDLER_KEYS=[b.KEY_LISTENERS,b.KEY_ERR,b.KEY_RAW];b.DOT_SLASH=`.${pc}`;b.BACK_SLASH_RE=/\\/g;b.DOUBLE_SLASH_RE=/\/\//;b.SLASH_OR_BACK_SLASH_RE=/[/\\]/;b.DOT_RE=/\..*\.(sw[px])$|~$|\.subl.*\.tmp/;b.REPLACER_RE=/^\.[/\\]/;b.SLASH="/";b.SLASH_SLASH="//";b.BRACE_START="{";b.BANG="!";b.ONE_DOT=".";b.TWO_DOTS="..";b.STAR="*";b.GLOBSTAR="**";b.ROOT_GLOBSTAR="/**/*";b.SLASH_GLOBSTAR="/**";b.DIR_SUFFIX="Dir";b.ANYMATCH_OPTS={dot:!0};b.STRING_TYPE="string";b.FUNCTION_TYPE="function";b.EMPTY_STR="";b.EMPTY_FN=()=>{};b.IDENTITY_FN=o=>o;b.isWindows=Qn==="win32";b.isMacos=Qn==="darwin";b.isLinux=Qn==="linux";b.isIBMi=uc.type()==="OS400"});var $r=H((kd,Mr)=>{"use strict";var Se=require("fs"),Q=require("path"),{promisify:_t}=require("util"),hc=Rr(),{isWindows:gc,isLinux:fc,EMPTY_FN:mc,EMPTY_STR:wc,KEY_LISTENERS:Qe,KEY_ERR:Xn,KEY_RAW:wt,HANDLER_KEYS:vc,EV_CHANGE:Qt,EV_ADD:Yt,EV_ADD_DIR:yc,EV_ERROR:Tr,STR_DATA:_c,STR_END:kc,BRACE_START:bc,STAR:xc}=Kt(),Cc="watch",Pc=_t(Se.open),Ar=_t(Se.stat),Sc=_t(Se.lstat),Rc=_t(Se.close),Jn=_t(Se.realpath),Ec={lstat:Sc,stat:Ar},eo=(o,e)=>{o instanceof Set?o.forEach(e):e(o)},vt=(o,e,t)=>{let s=o[e];s instanceof Set||(o[e]=s=new Set([s])),s.add(t)},Tc=o=>e=>{let t=o[e];t instanceof Set?t.clear():delete o[e]},yt=(o,e,t)=>{let s=o[e];s instanceof Set?s.delete(t):s===t&&delete o[e]},Ir=o=>o instanceof Set?o.size===0:!o,Xt=new Map;function Er(o,e,t,s,n){let r=(i,a)=>{t(o),n(i,a,{watchedPath:o}),a&&o!==a&&Jt(Q.resolve(o,a),Qe,Q.join(o,a))};try{return Se.watch(o,e,r)}catch(i){s(i)}}var Jt=(o,e,t,s,n)=>{let r=Xt.get(o);r&&eo(r[e],i=>{i(t,s,n)})},Ac=(o,e,t,s)=>{let{listener:n,errHandler:r,rawEmitter:i}=s,a=Xt.get(e),c;if(!t.persistent)return c=Er(o,t,n,r,i),c.close.bind(c);if(a)vt(a,Qe,n),vt(a,Xn,r),vt(a,wt,i);else{if(c=Er(o,t,Jt.bind(null,e,Qe),r,Jt.bind(null,e,wt)),!c)return;c.on(Tr,async l=>{let p=Jt.bind(null,e,Xn);if(a.watcherUnusable=!0,gc&&l.code==="EPERM")try{let d=await Pc(o,"r");await Rc(d),p(l)}catch{}else p(l)}),a={listeners:n,errHandlers:r,rawEmitters:i,watcher:c},Xt.set(e,a)}return()=>{yt(a,Qe,n),yt(a,Xn,r),yt(a,wt,i),Ir(a.listeners)&&(a.watcher.close(),Xt.delete(e),vc.forEach(Tc(a)),a.watcher=void 0,Object.freeze(a))}},Zn=new Map,Ic=(o,e,t,s)=>{let{listener:n,rawEmitter:r}=s,i=Zn.get(e),a=new Set,c=new Set,l=i&&i.options;return l&&(l.persistent<t.persistent||l.interval>t.interval)&&(a=i.listeners,c=i.rawEmitters,Se.unwatchFile(e),i=void 0),i?(vt(i,Qe,n),vt(i,wt,r)):(i={listeners:n,rawEmitters:r,options:t,watcher:Se.watchFile(e,t,(p,d)=>{eo(i.rawEmitters,h=>{h(Qt,e,{curr:p,prev:d})});let u=p.mtimeMs;(p.size!==d.size||u>d.mtimeMs||u===0)&&eo(i.listeners,h=>h(o,p))})},Zn.set(e,i)),()=>{yt(i,Qe,n),yt(i,wt,r),Ir(i.listeners)&&(Zn.delete(e),Se.unwatchFile(e),i.options=i.watcher=void 0,Object.freeze(i))}},to=class{constructor(e){this.fsw=e,this._boundHandleError=t=>e._handleError(t)}_watchWithNodeFs(e,t){let s=this.fsw.options,n=Q.dirname(e),r=Q.basename(e);this.fsw._getWatchedDir(n).add(r);let a=Q.resolve(e),c={persistent:s.persistent};t||(t=mc);let l;return s.usePolling?(c.interval=s.enableBinaryInterval&&hc(r)?s.binaryInterval:s.interval,l=Ic(e,a,c,{listener:t,rawEmitter:this.fsw._emitRaw})):l=Ac(e,a,c,{listener:t,errHandler:this._boundHandleError,rawEmitter:this.fsw._emitRaw}),l}_handleFile(e,t,s){if(this.fsw.closed)return;let n=Q.dirname(e),r=Q.basename(e),i=this.fsw._getWatchedDir(n),a=t;if(i.has(r))return;let c=async(p,d)=>{if(this.fsw._throttle(Cc,e,5)){if(!d||d.mtimeMs===0)try{let u=await Ar(e);if(this.fsw.closed)return;let h=u.atimeMs,w=u.mtimeMs;(!h||h<=w||w!==a.mtimeMs)&&this.fsw._emit(Qt,e,u),fc&&a.ino!==u.ino?(this.fsw._closeFile(p),a=u,this.fsw._addPathCloser(p,this._watchWithNodeFs(e,c))):a=u}catch{this.fsw._remove(n,r)}else if(i.has(r)){let u=d.atimeMs,h=d.mtimeMs;(!u||u<=h||h!==a.mtimeMs)&&this.fsw._emit(Qt,e,d),a=d}}},l=this._watchWithNodeFs(e,c);if(!(s&&this.fsw.options.ignoreInitial)&&this.fsw._isntIgnored(e)){if(!this.fsw._throttle(Yt,e,0))return;this.fsw._emit(Yt,e,t)}return l}async _handleSymlink(e,t,s,n){if(this.fsw.closed)return;let r=e.fullPath,i=this.fsw._getWatchedDir(t);if(!this.fsw.options.followSymlinks){this.fsw._incrReadyCount();let a;try{a=await Jn(s)}catch{return this.fsw._emitReady(),!0}return this.fsw.closed?void 0:(i.has(n)?this.fsw._symlinkPaths.get(r)!==a&&(this.fsw._symlinkPaths.set(r,a),this.fsw._emit(Qt,s,e.stats)):(i.add(n),this.fsw._symlinkPaths.set(r,a),this.fsw._emit(Yt,s,e.stats)),this.fsw._emitReady(),!0)}if(this.fsw._symlinkPaths.has(r))return!0;this.fsw._symlinkPaths.set(r,!0)}_handleRead(e,t,s,n,r,i,a){if(e=Q.join(e,wc),!s.hasGlob&&(a=this.fsw._throttle("readdir",e,1e3),!a))return;let c=this.fsw._getWatchedDir(s.path),l=new Set,p=this.fsw._readdirp(e,{fileFilter:d=>s.filterPath(d),directoryFilter:d=>s.filterDir(d),depth:0}).on(_c,async d=>{if(this.fsw.closed){p=void 0;return}let u=d.path,h=Q.join(e,u);if(l.add(u),!(d.stats.isSymbolicLink()&&await this._handleSymlink(d,e,h,u))){if(this.fsw.closed){p=void 0;return}(u===n||!n&&!c.has(u))&&(this.fsw._incrReadyCount(),h=Q.join(r,Q.relative(r,h)),this._addToNodeFs(h,t,s,i+1))}}).on(Tr,this._boundHandleError);return new Promise(d=>p.once(kc,()=>{if(this.fsw.closed){p=void 0;return}let u=a?a.clear():!1;d(),c.getChildren().filter(h=>h!==e&&!l.has(h)&&(!s.hasGlob||s.filterPath({fullPath:Q.resolve(e,h)}))).forEach(h=>{this.fsw._remove(e,h)}),p=void 0,u&&this._handleRead(e,!1,s,n,r,i,a)}))}async _handleDir(e,t,s,n,r,i,a){let c=this.fsw._getWatchedDir(Q.dirname(e)),l=c.has(Q.basename(e));!(s&&this.fsw.options.ignoreInitial)&&!r&&!l&&(!i.hasGlob||i.globFilter(e))&&this.fsw._emit(yc,e,t),c.add(Q.basename(e)),this.fsw._getWatchedDir(e);let p,d,u=this.fsw.options.depth;if((u==null||n<=u)&&!this.fsw._symlinkPaths.has(a)){if(!r&&(await this._handleRead(e,s,i,r,e,n,p),this.fsw.closed))return;d=this._watchWithNodeFs(e,(h,w)=>{w&&w.mtimeMs===0||this._handleRead(h,!1,i,r,e,n,p)})}return d}async _addToNodeFs(e,t,s,n,r){let i=this.fsw._emitReady;if(this.fsw._isIgnored(e)||this.fsw.closed)return i(),!1;let a=this.fsw._getWatchHelpers(e,n);!a.hasGlob&&s&&(a.hasGlob=s.hasGlob,a.globFilter=s.globFilter,a.filterPath=c=>s.filterPath(c),a.filterDir=c=>s.filterDir(c));try{let c=await Ec[a.statMethod](a.watchPath);if(this.fsw.closed)return;if(this.fsw._isIgnored(a.watchPath,c))return i(),!1;let l=this.fsw.options.followSymlinks&&!e.includes(xc)&&!e.includes(bc),p;if(c.isDirectory()){let d=Q.resolve(e),u=l?await Jn(e):e;if(this.fsw.closed||(p=await this._handleDir(a.watchPath,c,t,n,r,a,u),this.fsw.closed))return;d!==u&&u!==void 0&&this.fsw._symlinkPaths.set(d,u)}else if(c.isSymbolicLink()){let d=l?await Jn(e):e;if(this.fsw.closed)return;let u=Q.dirname(a.watchPath);if(this.fsw._getWatchedDir(u).add(a.watchPath),this.fsw._emit(Yt,a.watchPath,c),p=await this._handleDir(u,c,t,n,e,a,d),this.fsw.closed)return;d!==void 0&&this.fsw._symlinkPaths.set(Q.resolve(e),d)}else p=this._handleFile(a.watchPath,c,t);return i(),this.fsw._addPathCloser(e,p),!1}catch(c){if(this.fsw._handleError(c))return i(),e}}};Mr.exports=to});var Or=H((bd,lo)=>{"use strict";var ao=require("fs"),X=require("path"),{promisify:co}=require("util"),Xe;try{Xe=require("fsevents")}catch(o){process.env.CHOKIDAR_PRINT_FSEVENTS_REQUIRE_ERROR&&console.error(o)}if(Xe){let o=process.version.match(/v(\d+)\.(\d+)/);if(o&&o[1]&&o[2]){let e=Number.parseInt(o[1],10),t=Number.parseInt(o[2],10);e===8&&t<16&&(Xe=void 0)}}var{EV_ADD:no,EV_CHANGE:Mc,EV_ADD_DIR:Dr,EV_UNLINK:Zt,EV_ERROR:$c,STR_DATA:Dc,STR_END:Fc,FSEVENT_CREATED:Lc,FSEVENT_MODIFIED:Bc,FSEVENT_DELETED:Hc,FSEVENT_MOVED:Nc,FSEVENT_UNKNOWN:Oc,FSEVENT_FLAG_MUST_SCAN_SUBDIRS:jc,FSEVENT_TYPE_FILE:Wc,FSEVENT_TYPE_DIRECTORY:kt,FSEVENT_TYPE_SYMLINK:Nr,ROOT_GLOBSTAR:Fr,DIR_SUFFIX:Uc,DOT_SLASH:Lr,FUNCTION_TYPE:oo,EMPTY_FN:qc,IDENTITY_FN:Gc}=Kt(),Vc=o=>isNaN(o)?{}:{depth:o},ro=co(ao.stat),zc=co(ao.lstat),Br=co(ao.realpath),Kc={stat:ro,lstat:zc},je=new Map,Yc=10,Qc=new Set([69888,70400,71424,72704,73472,131328,131840,262912]),Xc=(o,e)=>({stop:Xe.watch(o,e)});function Jc(o,e,t,s){let n=X.extname(e)?X.dirname(e):e,r=X.dirname(n),i=je.get(n);Zc(r)&&(n=r);let a=X.resolve(o),c=a!==e,l=(d,u,h)=>{c&&(d=d.replace(e,a)),(d===a||!d.indexOf(a+X.sep))&&t(d,u,h)},p=!1;for(let d of je.keys())if(e.indexOf(X.resolve(d)+X.sep)===0){n=d,i=je.get(n),p=!0;break}return i||p?i.listeners.add(l):(i={listeners:new Set([l]),rawEmitter:s,watcher:Xc(n,(d,u)=>{if(!i.listeners.size||u&jc)return;let h=Xe.getInfo(d,u);i.listeners.forEach(w=>{w(d,u,h)}),i.rawEmitter(h.event,d,h)})},je.set(n,i)),()=>{let d=i.listeners;if(d.delete(l),!d.size&&(je.delete(n),i.watcher))return i.watcher.stop().then(()=>{i.rawEmitter=i.watcher=void 0,Object.freeze(i)})}}var Zc=o=>{let e=0;for(let t of je.keys())if(t.indexOf(o)===0&&(e++,e>=Yc))return!0;return!1},el=()=>Xe&&je.size<128,so=(o,e)=>{let t=0;for(;!o.indexOf(e)&&(o=X.dirname(o))!==e;)t++;return t},Hr=(o,e)=>o.type===kt&&e.isDirectory()||o.type===Nr&&e.isSymbolicLink()||o.type===Wc&&e.isFile(),io=class{constructor(e){this.fsw=e}checkIgnored(e,t){let s=this.fsw._ignoredPaths;if(this.fsw._isIgnored(e,t))return s.add(e),t&&t.isDirectory()&&s.add(e+Fr),!0;s.delete(e),s.delete(e+Fr)}addOrChange(e,t,s,n,r,i,a,c){let l=r.has(i)?Mc:no;this.handleEvent(l,e,t,s,n,r,i,a,c)}async checkExists(e,t,s,n,r,i,a,c){try{let l=await ro(e);if(this.fsw.closed)return;Hr(a,l)?this.addOrChange(e,t,s,n,r,i,a,c):this.handleEvent(Zt,e,t,s,n,r,i,a,c)}catch(l){l.code==="EACCES"?this.addOrChange(e,t,s,n,r,i,a,c):this.handleEvent(Zt,e,t,s,n,r,i,a,c)}}handleEvent(e,t,s,n,r,i,a,c,l){if(!(this.fsw.closed||this.checkIgnored(t)))if(e===Zt){let p=c.type===kt;(p||i.has(a))&&this.fsw._remove(r,a,p)}else{if(e===no){if(c.type===kt&&this.fsw._getWatchedDir(t),c.type===Nr&&l.followSymlinks){let d=l.depth===void 0?void 0:so(s,n)+1;return this._addToFsEvents(t,!1,!0,d)}this.fsw._getWatchedDir(r).add(a)}let p=c.type===kt?e+Uc:e;this.fsw._emit(p,t),p===Dr&&this._addToFsEvents(t,!1,!0)}}_watchWithFsEvents(e,t,s,n){if(this.fsw.closed||this.fsw._isIgnored(e))return;let r=this.fsw.options,a=Jc(e,t,async(c,l,p)=>{if(this.fsw.closed||r.depth!==void 0&&so(c,t)>r.depth)return;let d=s(X.join(e,X.relative(e,c)));if(n&&!n(d))return;let u=X.dirname(d),h=X.basename(d),w=this.fsw._getWatchedDir(p.type===kt?d:u);if(Qc.has(l)||p.event===Oc)if(typeof r.ignored===oo){let v;try{v=await ro(d)}catch{}if(this.fsw.closed||this.checkIgnored(d,v))return;Hr(p,v)?this.addOrChange(d,c,t,u,w,h,p,r):this.handleEvent(Zt,d,c,t,u,w,h,p,r)}else this.checkExists(d,c,t,u,w,h,p,r);else switch(p.event){case Lc:case Bc:return this.addOrChange(d,c,t,u,w,h,p,r);case Hc:case Nc:return this.checkExists(d,c,t,u,w,h,p,r)}},this.fsw._emitRaw);return this.fsw._emitReady(),a}async _handleFsEventsSymlink(e,t,s,n){if(!(this.fsw.closed||this.fsw._symlinkPaths.has(t))){this.fsw._symlinkPaths.set(t,!0),this.fsw._incrReadyCount();try{let r=await Br(e);if(this.fsw.closed)return;if(this.fsw._isIgnored(r))return this.fsw._emitReady();this.fsw._incrReadyCount(),this._addToFsEvents(r||e,i=>{let a=e;return r&&r!==Lr?a=i.replace(r,e):i!==Lr&&(a=X.join(e,i)),s(a)},!1,n)}catch(r){if(this.fsw._handleError(r))return this.fsw._emitReady()}}}emitAdd(e,t,s,n,r){let i=s(e),a=t.isDirectory(),c=this.fsw._getWatchedDir(X.dirname(i)),l=X.basename(i);a&&this.fsw._getWatchedDir(i),!c.has(l)&&(c.add(l),(!n.ignoreInitial||r===!0)&&this.fsw._emit(a?Dr:no,i,t))}initWatch(e,t,s,n){if(this.fsw.closed)return;let r=this._watchWithFsEvents(s.watchPath,X.resolve(e||s.watchPath),n,s.globFilter);this.fsw._addPathCloser(t,r)}async _addToFsEvents(e,t,s,n){if(this.fsw.closed)return;let r=this.fsw.options,i=typeof t===oo?t:Gc,a=this.fsw._getWatchHelpers(e);try{let c=await Kc[a.statMethod](a.watchPath);if(this.fsw.closed)return;if(this.fsw._isIgnored(a.watchPath,c))throw null;if(c.isDirectory()){if(a.globFilter||this.emitAdd(i(e),c,i,r,s),n&&n>r.depth)return;this.fsw._readdirp(a.watchPath,{fileFilter:l=>a.filterPath(l),directoryFilter:l=>a.filterDir(l),...Vc(r.depth-(n||0))}).on(Dc,l=>{if(this.fsw.closed||l.stats.isDirectory()&&!a.filterPath(l))return;let p=X.join(a.watchPath,l.path),{fullPath:d}=l;if(a.followSymlinks&&l.stats.isSymbolicLink()){let u=r.depth===void 0?void 0:so(p,X.resolve(a.watchPath))+1;this._handleFsEventsSymlink(p,d,i,u)}else this.emitAdd(p,l.stats,i,r,s)}).on($c,qc).on(Fc,()=>{this.fsw._emitReady()})}else this.emitAdd(a.watchPath,c,i,r,s),this.fsw._emitReady()}catch(c){(!c||this.fsw._handleError(c))&&(this.fsw._emitReady(),this.fsw._emitReady())}if(r.persistent&&s!==!0)if(typeof t===oo)this.initWatch(void 0,e,a,i);else{let c;try{c=await Br(a.watchPath)}catch{}this.initWatch(c,e,a,i)}}};lo.exports=io;lo.exports.canUse=el});var So=H(Po=>{"use strict";var{EventEmitter:tl}=require("events"),xo=require("fs"),N=require("path"),{promisify:zr}=require("util"),nl=Rs(),mo=Ds().default,ol=Os(),po=Un(),sl=br(),rl=jn(),il=$r(),jr=Or(),{EV_ALL:uo,EV_READY:al,EV_ADD:en,EV_CHANGE:bt,EV_UNLINK:Wr,EV_ADD_DIR:cl,EV_UNLINK_DIR:ll,EV_RAW:dl,EV_ERROR:ho,STR_CLOSE:pl,STR_END:ul,BACK_SLASH_RE:hl,DOUBLE_SLASH_RE:Ur,SLASH_OR_BACK_SLASH_RE:gl,DOT_RE:fl,REPLACER_RE:ml,SLASH:go,SLASH_SLASH:wl,BRACE_START:vl,BANG:wo,ONE_DOT:Kr,TWO_DOTS:yl,GLOBSTAR:_l,SLASH_GLOBSTAR:fo,ANYMATCH_OPTS:vo,STRING_TYPE:Co,FUNCTION_TYPE:kl,EMPTY_STR:yo,EMPTY_FN:bl,isWindows:xl,isMacos:Cl,isIBMi:Pl}=Kt(),Sl=zr(xo.stat),Rl=zr(xo.readdir),_o=(o=[])=>Array.isArray(o)?o:[o],Yr=(o,e=[])=>(o.forEach(t=>{Array.isArray(t)?Yr(t,e):e.push(t)}),e),qr=o=>{let e=Yr(_o(o));if(!e.every(t=>typeof t===Co))throw new TypeError(`Non-string provided as watch path: ${e}`);return e.map(Qr)},Gr=o=>{let e=o.replace(hl,go),t=!1;for(e.startsWith(wl)&&(t=!0);e.match(Ur);)e=e.replace(Ur,go);return t&&(e=go+e),e},Qr=o=>Gr(N.normalize(Gr(o))),Vr=(o=yo)=>e=>typeof e!==Co?e:Qr(N.isAbsolute(e)?e:N.join(o,e)),El=(o,e)=>N.isAbsolute(o)?o:o.startsWith(wo)?wo+N.join(e,o.slice(1)):N.join(e,o),ye=(o,e)=>o[e]===void 0,ko=class{constructor(e,t){this.path=e,this._removeWatcher=t,this.items=new Set}add(e){let{items:t}=this;t&&e!==Kr&&e!==yl&&t.add(e)}async remove(e){let{items:t}=this;if(!t||(t.delete(e),t.size>0))return;let s=this.path;try{await Rl(s)}catch{this._removeWatcher&&this._removeWatcher(N.dirname(s),N.basename(s))}}has(e){let{items:t}=this;if(t)return t.has(e)}getChildren(){let{items:e}=this;if(e)return[...e.values()]}dispose(){this.items.clear(),delete this.path,delete this._removeWatcher,delete this.items,Object.freeze(this)}},Tl="stat",Al="lstat",bo=class{constructor(e,t,s,n){this.fsw=n,this.path=e=e.replace(ml,yo),this.watchPath=t,this.fullWatchPath=N.resolve(t),this.hasGlob=t!==e,e===yo&&(this.hasGlob=!1),this.globSymlink=this.hasGlob&&s?void 0:!1,this.globFilter=this.hasGlob?mo(e,void 0,vo):!1,this.dirParts=this.getDirParts(e),this.dirParts.forEach(r=>{r.length>1&&r.pop()}),this.followSymlinks=s,this.statMethod=s?Tl:Al}checkGlobSymlink(e){return this.globSymlink===void 0&&(this.globSymlink=e.fullParentDir===this.fullWatchPath?!1:{realPath:e.fullParentDir,linkPath:this.fullWatchPath}),this.globSymlink?e.fullPath.replace(this.globSymlink.realPath,this.globSymlink.linkPath):e.fullPath}entryPath(e){return N.join(this.watchPath,N.relative(this.watchPath,this.checkGlobSymlink(e)))}filterPath(e){let{stats:t}=e;if(t&&t.isSymbolicLink())return this.filterDir(e);let s=this.entryPath(e);return(this.hasGlob&&typeof this.globFilter===kl?this.globFilter(s):!0)&&this.fsw._isntIgnored(s,t)&&this.fsw._hasReadPermissions(t)}getDirParts(e){if(!this.hasGlob)return[];let t=[];return(e.includes(vl)?sl.expand(e):[e]).forEach(n=>{t.push(N.relative(this.watchPath,n).split(gl))}),t}filterDir(e){if(this.hasGlob){let t=this.getDirParts(this.checkGlobSymlink(e)),s=!1;this.unmatchedGlob=!this.dirParts.some(n=>n.every((r,i)=>(r===_l&&(s=!0),s||!t[0][i]||mo(r,t[0][i],vo))))}return!this.unmatchedGlob&&this.fsw._isntIgnored(this.entryPath(e),e.stats)}},tn=class extends tl{constructor(e){super();let t={};e&&Object.assign(t,e),this._watched=new Map,this._closers=new Map,this._ignoredPaths=new Set,this._throttled=new Map,this._symlinkPaths=new Map,this._streams=new Set,this.closed=!1,ye(t,"persistent")&&(t.persistent=!0),ye(t,"ignoreInitial")&&(t.ignoreInitial=!1),ye(t,"ignorePermissionErrors")&&(t.ignorePermissionErrors=!1),ye(t,"interval")&&(t.interval=100),ye(t,"binaryInterval")&&(t.binaryInterval=300),ye(t,"disableGlobbing")&&(t.disableGlobbing=!1),t.enableBinaryInterval=t.binaryInterval!==t.interval,ye(t,"useFsEvents")&&(t.useFsEvents=!t.usePolling),jr.canUse()||(t.useFsEvents=!1),ye(t,"usePolling")&&!t.useFsEvents&&(t.usePolling=Cl),Pl&&(t.usePolling=!0);let n=process.env.CHOKIDAR_USEPOLLING;if(n!==void 0){let c=n.toLowerCase();c==="false"||c==="0"?t.usePolling=!1:c==="true"||c==="1"?t.usePolling=!0:t.usePolling=!!c}let r=process.env.CHOKIDAR_INTERVAL;r&&(t.interval=Number.parseInt(r,10)),ye(t,"atomic")&&(t.atomic=!t.usePolling&&!t.useFsEvents),t.atomic&&(this._pendingUnlinks=new Map),ye(t,"followSymlinks")&&(t.followSymlinks=!0),ye(t,"awaitWriteFinish")&&(t.awaitWriteFinish=!1),t.awaitWriteFinish===!0&&(t.awaitWriteFinish={});let i=t.awaitWriteFinish;i&&(i.stabilityThreshold||(i.stabilityThreshold=2e3),i.pollInterval||(i.pollInterval=100),this._pendingWrites=new Map),t.ignored&&(t.ignored=_o(t.ignored));let a=0;this._emitReady=()=>{a++,a>=this._readyCount&&(this._emitReady=bl,this._readyEmitted=!0,process.nextTick(()=>this.emit(al)))},this._emitRaw=(...c)=>this.emit(dl,...c),this._readyEmitted=!1,this.options=t,t.useFsEvents?this._fsEventsHandler=new jr(this):this._nodeFsHandler=new il(this),Object.freeze(t)}add(e,t,s){let{cwd:n,disableGlobbing:r}=this.options;this.closed=!1;let i=qr(e);return n&&(i=i.map(a=>{let c=El(a,n);return r||!po(a)?c:rl(c)})),i=i.filter(a=>a.startsWith(wo)?(this._ignoredPaths.add(a.slice(1)),!1):(this._ignoredPaths.delete(a),this._ignoredPaths.delete(a+fo),this._userIgnored=void 0,!0)),this.options.useFsEvents&&this._fsEventsHandler?(this._readyCount||(this._readyCount=i.length),this.options.persistent&&(this._readyCount+=i.length),i.forEach(a=>this._fsEventsHandler._addToFsEvents(a))):(this._readyCount||(this._readyCount=0),this._readyCount+=i.length,Promise.all(i.map(async a=>{let c=await this._nodeFsHandler._addToNodeFs(a,!s,0,0,t);return c&&this._emitReady(),c})).then(a=>{this.closed||a.filter(c=>c).forEach(c=>{this.add(N.dirname(c),N.basename(t||c))})})),this}unwatch(e){if(this.closed)return this;let t=qr(e),{cwd:s}=this.options;return t.forEach(n=>{!N.isAbsolute(n)&&!this._closers.has(n)&&(s&&(n=N.join(s,n)),n=N.resolve(n)),this._closePath(n),this._ignoredPaths.add(n),this._watched.has(n)&&this._ignoredPaths.add(n+fo),this._userIgnored=void 0}),this}close(){if(this.closed)return this._closePromise;this.closed=!0,this.removeAllListeners();let e=[];return this._closers.forEach(t=>t.forEach(s=>{let n=s();n instanceof Promise&&e.push(n)})),this._streams.forEach(t=>t.destroy()),this._userIgnored=void 0,this._readyCount=0,this._readyEmitted=!1,this._watched.forEach(t=>t.dispose()),["closers","watched","streams","symlinkPaths","throttled"].forEach(t=>{this[`_${t}`].clear()}),this._closePromise=e.length?Promise.all(e).then(()=>{}):Promise.resolve(),this._closePromise}getWatched(){let e={};return this._watched.forEach((t,s)=>{let n=this.options.cwd?N.relative(this.options.cwd,s):s;e[n||Kr]=t.getChildren().sort()}),e}emitWithAll(e,t){this.emit(...t),e!==ho&&this.emit(uo,...t)}async _emit(e,t,s,n,r){if(this.closed)return;let i=this.options;xl&&(t=N.normalize(t)),i.cwd&&(t=N.relative(i.cwd,t));let a=[e,t];r!==void 0?a.push(s,n,r):n!==void 0?a.push(s,n):s!==void 0&&a.push(s);let c=i.awaitWriteFinish,l;if(c&&(l=this._pendingWrites.get(t)))return l.lastChange=new Date,this;if(i.atomic){if(e===Wr)return this._pendingUnlinks.set(t,a),setTimeout(()=>{this._pendingUnlinks.forEach((p,d)=>{this.emit(...p),this.emit(uo,...p),this._pendingUnlinks.delete(d)})},typeof i.atomic=="number"?i.atomic:100),this;e===en&&this._pendingUnlinks.has(t)&&(e=a[0]=bt,this._pendingUnlinks.delete(t))}if(c&&(e===en||e===bt)&&this._readyEmitted){let p=(d,u)=>{d?(e=a[0]=ho,a[1]=d,this.emitWithAll(e,a)):u&&(a.length>2?a[2]=u:a.push(u),this.emitWithAll(e,a))};return this._awaitWriteFinish(t,c.stabilityThreshold,e,p),this}if(e===bt&&!this._throttle(bt,t,50))return this;if(i.alwaysStat&&s===void 0&&(e===en||e===cl||e===bt)){let p=i.cwd?N.join(i.cwd,t):t,d;try{d=await Sl(p)}catch{}if(!d||this.closed)return;a.push(d)}return this.emitWithAll(e,a),this}_handleError(e){let t=e&&e.code;return e&&t!=="ENOENT"&&t!=="ENOTDIR"&&(!this.options.ignorePermissionErrors||t!=="EPERM"&&t!=="EACCES")&&this.emit(ho,e),e||this.closed}_throttle(e,t,s){this._throttled.has(e)||this._throttled.set(e,new Map);let n=this._throttled.get(e),r=n.get(t);if(r)return r.count++,!1;let i,a=()=>{let l=n.get(t),p=l?l.count:0;return n.delete(t),clearTimeout(i),l&&clearTimeout(l.timeoutObject),p};i=setTimeout(a,s);let c={timeoutObject:i,clear:a,count:0};return n.set(t,c),c}_incrReadyCount(){return this._readyCount++}_awaitWriteFinish(e,t,s,n){let r,i=e;this.options.cwd&&!N.isAbsolute(e)&&(i=N.join(this.options.cwd,e));let a=new Date,c=l=>{xo.stat(i,(p,d)=>{if(p||!this._pendingWrites.has(e)){p&&p.code!=="ENOENT"&&n(p);return}let u=Number(new Date);l&&d.size!==l.size&&(this._pendingWrites.get(e).lastChange=u);let h=this._pendingWrites.get(e);u-h.lastChange>=t?(this._pendingWrites.delete(e),n(void 0,d)):r=setTimeout(c,this.options.awaitWriteFinish.pollInterval,d)})};this._pendingWrites.has(e)||(this._pendingWrites.set(e,{lastChange:a,cancelWait:()=>(this._pendingWrites.delete(e),clearTimeout(r),s)}),r=setTimeout(c,this.options.awaitWriteFinish.pollInterval))}_getGlobIgnored(){return[...this._ignoredPaths.values()]}_isIgnored(e,t){if(this.options.atomic&&fl.test(e))return!0;if(!this._userIgnored){let{cwd:s}=this.options,n=this.options.ignored,r=n&&n.map(Vr(s)),i=_o(r).filter(c=>typeof c===Co&&!po(c)).map(c=>c+fo),a=this._getGlobIgnored().map(Vr(s)).concat(r,i);this._userIgnored=mo(a,void 0,vo)}return this._userIgnored([e,t])}_isntIgnored(e,t){return!this._isIgnored(e,t)}_getWatchHelpers(e,t){let s=t||this.options.disableGlobbing||!po(e)?e:ol(e),n=this.options.followSymlinks;return new bo(e,s,n,this)}_getWatchedDir(e){this._boundRemove||(this._boundRemove=this._remove.bind(this));let t=N.resolve(e);return this._watched.has(t)||this._watched.set(t,new ko(t,this._boundRemove)),this._watched.get(t)}_hasReadPermissions(e){if(this.options.ignorePermissionErrors)return!0;let s=(e&&Number.parseInt(e.mode,10))&511;return!!(4&Number.parseInt(s.toString(8)[0],10))}_remove(e,t,s){let n=N.join(e,t),r=N.resolve(n);if(s=s??(this._watched.has(n)||this._watched.has(r)),!this._throttle("remove",n,100))return;!s&&!this.options.useFsEvents&&this._watched.size===1&&this.add(e,t,!0),this._getWatchedDir(n).getChildren().forEach(u=>this._remove(n,u));let c=this._getWatchedDir(e),l=c.has(t);c.remove(t),this._symlinkPaths.has(r)&&this._symlinkPaths.delete(r);let p=n;if(this.options.cwd&&(p=N.relative(this.options.cwd,n)),this.options.awaitWriteFinish&&this._pendingWrites.has(p)&&this._pendingWrites.get(p).cancelWait()===en)return;this._watched.delete(n),this._watched.delete(r);let d=s?ll:Wr;l&&!this._isIgnored(n)&&this._emit(d,n),this.options.useFsEvents||this._closePath(n)}_closePath(e){this._closeFile(e);let t=N.dirname(e);this._getWatchedDir(t).remove(N.basename(e))}_closeFile(e){let t=this._closers.get(e);t&&(t.forEach(s=>s()),this._closers.delete(e))}_addPathCloser(e,t){if(!t)return;let s=this._closers.get(e);s||(s=[],this._closers.set(e,s)),s.push(t)}_readdirp(e,t){if(this.closed)return;let s={type:uo,alwaysStat:!0,lstat:!0,...t},n=nl(e,s);return this._streams.add(n),n.once(pl,()=>{n=void 0}),n.once(ul,()=>{n&&(this._streams.delete(n),n=void 0)}),n}};Po.FSWatcher=tn;var Il=(o,e)=>{let t=new tn(e);return t.add(o),t};Po.watch=Il});var Ul={};_i(Ul,{activate:()=>Nl,deactivate:()=>Ol,ensureServerRunning:()=>Ko});module.exports=ki(Ul);var q=P(require("vscode"));var M=P(require("vscode"));var Ve=P(require("fs")),Ce=P(require("path")),Xo=P(require("crypto")),lt=new Map;function Qo(o){let e=Ce.join(o,".projectmemory","identity.json");try{if(!Ve.existsSync(e))return null;let t=Ve.readFileSync(e,"utf-8"),s=JSON.parse(t);return!s.workspace_id||!s.workspace_path?null:{workspaceId:s.workspace_id,workspaceName:Ce.basename(s.workspace_path),projectPath:s.workspace_path}}catch{return null}}function ge(o){let e=Ce.normalize(o);if(console.log("[PM Identity] Resolving identity for:",e),lt.has(e)){let s=lt.get(e);return console.log("[PM Identity] Cache hit:",s?.workspaceId??"null"),s??null}let t=Qo(e);if(t)return console.log("[PM Identity] Found at root:",t.workspaceId),lt.set(e,t),t;try{let s=Ve.readdirSync(e,{withFileTypes:!0});console.log("[PM Identity] Scanning",s.length,"entries in root");for(let n of s){if(!n.isDirectory()||n.name.startsWith(".")||n.name==="node_modules")continue;let r=Ce.join(e,n.name);if(t=Qo(r),t)return console.log("[PM Identity] Found in subdir:",n.name,"->",t.workspaceId),lt.set(e,t),t}}catch(s){console.log("[PM Identity] Scan error:",s)}return console.log("[PM Identity] No identity found, caching null"),lt.set(e,null),null}function dt(o){let e=Ce.normalize(o).toLowerCase(),t=Xo.createHash("sha256").update(e).digest("hex").substring(0,12);return`${Ce.basename(o).replace(/[^a-zA-Z0-9-_]/g,"-")}-${t}`}var Zo=P(require("http")),pt=P(require("vscode"));function Jo(o,e=3e3){return new Promise(t=>{let s=Zo.get(o,n=>{if(n.statusCode!==200){t(null),n.resume();return}let r="";n.on("data",i=>{r+=i.toString()}),n.on("end",()=>{try{let i=JSON.parse(r);i?.status==="ok"?t(i):t(null)}catch{t(null)}})});s.on("error",()=>t(null)),s.setTimeout(e,()=>{s.destroy(),t(null)})})}async function Pn(o=3e3,e=3001){let[t,s]=await Promise.all([Jo(`http://localhost:${o}/health`),Jo(`http://localhost:${e}/api/health`)]);return{detected:t!==null&&s!==null,mcpHealthy:t!==null,dashboardHealthy:s!==null,mcpInfo:t||void 0,dashboardInfo:s||void 0}}function Sn(){return pt.workspace.getConfiguration("projectMemory").get("containerMode","auto")}function Dt(){return pt.workspace.getConfiguration("projectMemory").get("containerMcpPort",3e3)}function He(){let o=pt.workspace.getConfiguration("projectMemory"),e=o.get("containerMode","auto"),t=o.get("serverPort",3001);return e==="local"?"http://localhost:5173":`http://localhost:${t}`}async function es(){let o=Sn();if(o==="local")return{useContainer:!1,status:{detected:!1,mcpHealthy:!1,dashboardHealthy:!1}};let e=Dt(),s=pt.workspace.getConfiguration("projectMemory").get("serverPort",3001),n=await Pn(e,s);return o==="container"?{useContainer:!0,status:n}:{useContainer:n.detected,status:n}}function Rn(o,...e){return M.workspace.getConfiguration("projectMemory").get("showNotifications",!0)?M.window.showInformationMessage(o,...e):Promise.resolve(void 0)}var Ft=class{constructor(e,t,s){this._extensionUri=e;this._dataRoot=t,this._agentsRoot=s}static viewType="projectMemory.dashboardView";_view;_dataRoot;_agentsRoot;_disposables=[];_onResolveCallback;onFirstResolve(e){this._onResolveCallback=e}dispose(){for(;this._disposables.length;){let e=this._disposables.pop();e&&e.dispose()}}getWorkspaceId(){let e=M.workspace.workspaceFolders?.[0];if(!e)return null;let t=e.uri.fsPath;console.log("[PM Debug] getWorkspaceId for fsPath:",t);let s=ge(t);if(s)return console.log("[PM Debug] Found identity:",s.workspaceId,"from",s.projectPath),s.workspaceId;let n=dt(t);return console.log("[PM Debug] Using fallback ID:",n),n}getWorkspaceName(){let e=M.workspace.workspaceFolders?.[0];if(!e)return"No workspace";let t=ge(e.uri.fsPath);return t?t.workspaceName:e.name}resolveWebviewView(e,t,s){this._onResolveCallback&&(this._onResolveCallback(),this._onResolveCallback=void 0),this.dispose(),this._view=e,e.webview.options={enableScripts:!0,localResourceRoots:[M.Uri.joinPath(this._extensionUri,"webview","dist"),M.Uri.joinPath(this._extensionUri,"resources")]},e.webview.html=this._getHtmlForWebview(e.webview),this._disposables.push(e.onDidDispose(()=>{this._view=void 0})),this._disposables.push(e.webview.onDidReceiveMessage(async n=>{switch(console.log("Received message from webview:",n),n.type){case"openFile":let{filePath:r,line:i}=n.data;M.commands.executeCommand("projectMemory.openFile",r,i);break;case"runCommand":let{command:a}=n.data;console.log("Executing command:",a);try{await M.commands.executeCommand(a),console.log("Command executed successfully")}catch(k){console.error("Command execution failed:",k),M.window.showErrorMessage(`Command failed: ${k}`)}break;case"openExternal":let{url:c}=n.data;console.log("Opening dashboard panel:",c),M.commands.executeCommand("projectMemory.openDashboardPanel",c);break;case"openPlan":let{planId:l,workspaceId:p}=n.data,d=`${this.getDashboardUrl()}/workspace/${p}/plan/${l}`;console.log("Opening plan:",d),M.commands.executeCommand("projectMemory.openDashboardPanel",d);break;case"openPlanRoute":await this.openPlanRoute(n.data);break;case"planAction":await this.runPlanAction(n.data);break;case"isolateServer":await M.commands.executeCommand("projectMemory.isolateServer");break;case"copyToClipboard":let{text:u}=n.data;await M.env.clipboard.writeText(u),Rn(`Copied to clipboard: ${u}`);break;case"showNotification":let{level:h,text:w}=n.data;h==="error"?M.window.showErrorMessage(w):h==="warning"?M.window.showWarningMessage(w):Rn(w);break;case"revealInExplorer":let{path:v}=n.data;M.commands.executeCommand("revealInExplorer",M.Uri.file(v));break;case"getConfig":this.postMessage({type:"config",data:{dataRoot:this._dataRoot,agentsRoot:this._agentsRoot,workspaceFolders:M.workspace.workspaceFolders?.map(k=>({name:k.name,path:k.uri.fsPath}))||[]}});break;case"ready":this.postMessage({type:"init",data:{dataRoot:this._dataRoot,agentsRoot:this._agentsRoot}});break}}))}postMessage(e){this._view&&this._view.webview.postMessage(e)}updateConfig(e,t){this._dataRoot=e,this._agentsRoot=t,this.postMessage({type:"configUpdated",data:{dataRoot:e,agentsRoot:t}})}getApiPort(){let e=M.workspace.getConfiguration("projectMemory");return e.get("serverPort")||e.get("apiPort")||3001}getDashboardUrl(){return He()}async pickPlan(){let e=this.getWorkspaceId();if(!e)return M.window.showErrorMessage("No workspace is open."),null;let t=this.getApiPort();try{let s=await fetch(`http://localhost:${t}/api/plans/workspace/${e}`);if(!s.ok)return M.window.showErrorMessage("Failed to load plans from the dashboard server."),null;let n=await s.json(),r=Array.isArray(n.plans)?n.plans:[];if(r.length===0)return M.window.showInformationMessage("No plans found for this workspace."),null;let i=await M.window.showQuickPick(r.map(a=>{let c=a.id||a.plan_id||"unknown";return{label:a.title||c,description:a.status||"unknown",detail:c}}),{placeHolder:"Select a plan"});return!i||!i.detail?null:{workspaceId:e,planId:i.detail}}catch(s){return M.window.showErrorMessage(`Failed to load plans: ${s}`),null}}async openPlanRoute(e){let t=await this.pickPlan();if(!t)return;let{workspaceId:s,planId:n}=t,r=`${this.getDashboardUrl()}/workspace/${s}/plan/${n}`;e.route==="context"?r+="/context":e.route==="build-scripts"&&(r+="/build-scripts"),e.query&&(r+=`?${e.query}`),M.commands.executeCommand("projectMemory.openDashboardPanel",r)}async runPlanAction(e){let t=await this.pickPlan();if(!t)return;let{workspaceId:s,planId:n}=t,r=e.action==="archive"?"Archive":"Resume";if(e.action==="archive"&&await M.window.showWarningMessage(`Archive plan ${n}?`,{modal:!0},"Archive")!=="Archive")return;let i=this.getApiPort();try{let a=await fetch(`http://localhost:${i}/api/plans/${s}/${n}/${e.action}`,{method:"POST"});if(!a.ok){let l=await a.text();M.window.showErrorMessage(`Failed to ${e.action} plan: ${l}`);return}Rn(`${r}d plan ${n}`);let c=`${this.getDashboardUrl()}/workspace/${s}/plan/${n}`;M.commands.executeCommand("projectMemory.openDashboardPanel",c)}catch(a){M.window.showErrorMessage(`Failed to ${e.action} plan: ${a}`)}}_getHtmlForWebview(e){let t=bi(),s=M.workspace.getConfiguration("projectMemory"),n=s.get("serverPort")||s.get("apiPort")||3001,r=He(),i=this.getWorkspaceId()||"",a=this.getWorkspaceName(),c=JSON.stringify(this._dataRoot),l={dashboard:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>',knowledgeBase:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6.5 15.5H20"/></svg>',contextFiles:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>',contextFilesGrid:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="M3 15h6"/><path d="M15 3v18"/><path d="M15 9h6"/></svg>',agents:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/></svg>',syncHistory:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/></svg>',diagnostics:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',newTemplate:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="M12 5v14"/></svg>',resumePlan:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 3l14 9-14 9V3z"/></svg>',archive:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>',addContextNote:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3z"/><path d="M15 3v6h6"/><path d="M9 18h6"/><path d="M10 14h4"/></svg>',researchNote:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/><path d="M15 12h-9"/></svg>',createNewPlan:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v4"/><circle cx="18" cy="18" r="3"/><path d="M18 15v6"/><path d="M15 18h6"/></svg>',deployAgents:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v9"/><path d="m16 11 3-3 3 3"/></svg>',deployInstructions:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6.5 15.5H20"/><path d="M14 11V7"/><path d="m11 10 3-3 3 3"/></svg>',deployPrompts:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 11 2-2-2-2"/><path d="M11 9h4"/><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M12 15v4"/><path d="m9 18 3-3 3 3"/></svg>',configureDefaults:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/><path d="m9 12 2 2 4-4"/></svg>',deployAllDefaults:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14"/><path d="M16.5 9.4 7.55 4.24"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/><path d="M17 13h5"/><path d="M17 17h5"/><path d="M17 21h5"/></svg>',handoffEvent:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m16 13 4 4-4 4"/><path d="M20 17H4a2 2 0 0 1-2-2V5"/></svg>',noteEvent:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',stepUpdate:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',searchBox:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',buildScript:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',runButton:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>',stopStale:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="10" height="10" x="7" y="7" rx="2"/></svg>',healthBadge:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',dataRoot:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="3" y2="15"/></svg>',agentHandoff:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></svg>',isolate:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/><path d="M15 3v18"/></svg>'},p=JSON.stringify(l);return`<!DOCTYPE html>
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
        const apiPort = ${n};
        const dashboardUrl = '${r}';
        const workspaceId = '${i}';
        const workspaceName = '${a}';
        const dataRoot = ${c};
        const icons = ${p};
        
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
                                            <li><span class="label">API Port:</span> <span>${n}</span></li>
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
</html>`}};function bi(){let o="",e="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";for(let t=0;t<32;t++)o+=e.charAt(Math.floor(Math.random()*e.length));return o}var Je=P(require("vscode")),Xr=P(So()),xt=P(require("path"));function Ro(o,...e){return Je.workspace.getConfiguration("projectMemory").get("showNotifications",!0)?Je.window.showInformationMessage(o,...e):Promise.resolve(void 0)}var nn=class o{watcher=null;agentsRoot;autoDeploy;debounceTimer=null;pendingChanges=new Set;static DEBOUNCE_MS=500;constructor(e,t){this.agentsRoot=e,this.autoDeploy=t}start(){if(this.watcher)return;let e=xt.join(this.agentsRoot,"*.agent.md");this.watcher=Xr.watch(e,{persistent:!0,ignoreInitial:!0}),this.watcher.on("change",t=>{this.pendingChanges.add(t),this.scheduleFlush()}),this.watcher.on("add",t=>{let s=xt.basename(t,".agent.md");Ro(`New agent template detected: ${s}`)}),console.log(`Agent watcher started for: ${e}`)}scheduleFlush(){this.debounceTimer&&clearTimeout(this.debounceTimer),this.debounceTimer=setTimeout(()=>this.flushChanges(),o.DEBOUNCE_MS)}async flushChanges(){let e=[...this.pendingChanges];if(this.pendingChanges.clear(),this.debounceTimer=null,e.length===0)return;let t=e.map(n=>xt.basename(n,".agent.md")),s=t.length===1?t[0]:`${t.length} agents`;this.autoDeploy?Ro(`Deploying updated ${s}`):await Ro(`Agent template${t.length>1?"s":""} updated: ${s}`,"Deploy to All Workspaces","Ignore")==="Deploy to All Workspaces"&&Je.commands.executeCommand("projectMemory.deployAgents")}stop(){this.debounceTimer&&(clearTimeout(this.debounceTimer),this.debounceTimer=null),this.pendingChanges.clear(),this.watcher&&(this.watcher.close(),this.watcher=null,console.log("Agent watcher stopped"))}setAutoDeploy(e){this.autoDeploy=e}};var We=P(require("vscode")),Jr=P(So()),sn=P(require("path"));function Eo(o,...e){return We.workspace.getConfiguration("projectMemory").get("showNotifications",!0)?We.window.showInformationMessage(o,...e):Promise.resolve(void 0)}var on=class o{watchers=new Map;config;onFileChange;debounceTimer=null;pendingEvents=new Map;static DEBOUNCE_MS=300;constructor(e){this.config=e}start(){this.config.agentsRoot&&this.startWatcher("agent",this.config.agentsRoot,"*.agent.md"),this.config.promptsRoot&&this.startWatcher("prompt",this.config.promptsRoot,"*.prompt.md"),this.config.instructionsRoot&&this.startWatcher("instruction",this.config.instructionsRoot,"*.instructions.md")}startWatcher(e,t,s){if(this.watchers.has(e))return;let n=sn.join(t,s),r=Jr.watch(n,{persistent:!0,ignoreInitial:!0});r.on("change",async i=>{this.handleFileEvent(e,i,"change")}),r.on("add",i=>{this.handleFileEvent(e,i,"add")}),r.on("unlink",i=>{this.handleFileEvent(e,i,"unlink")}),this.watchers.set(e,r),console.log(`${e} watcher started for: ${n}`)}async handleFileEvent(e,t,s){this.pendingEvents.set(t,{type:e,filePath:t,action:s}),this.debounceTimer&&clearTimeout(this.debounceTimer),this.debounceTimer=setTimeout(()=>this.flushEvents(),o.DEBOUNCE_MS)}async flushEvents(){let e=[...this.pendingEvents.values()];this.pendingEvents.clear(),this.debounceTimer=null;for(let{type:t,filePath:s,action:n}of e)await this.processFileEvent(t,s,n)}async processFileEvent(e,t,s){let n=sn.basename(t),i={agent:"Agent template",prompt:"Prompt file",instruction:"Instruction file"}[e];if(this.onFileChange&&this.onFileChange(e,t,s),s==="unlink"){We.window.showWarningMessage(`${i} deleted: ${n}`);return}if(s==="add"){Eo(`New ${i.toLowerCase()} detected: ${n}`);return}this.config.autoDeploy?(Eo(`Auto-deploying updated ${i.toLowerCase()}: ${n}`),this.triggerDeploy(e)):await Eo(`${i} updated: ${n}`,"Deploy to All Workspaces","Ignore")==="Deploy to All Workspaces"&&this.triggerDeploy(e)}triggerDeploy(e){let t={agent:"projectMemory.deployAgents",prompt:"projectMemory.deployPrompts",instruction:"projectMemory.deployInstructions"};We.commands.executeCommand(t[e])}stop(){this.debounceTimer&&(clearTimeout(this.debounceTimer),this.debounceTimer=null),this.pendingEvents.clear();for(let[e,t]of this.watchers)t.close(),console.log(`${e} watcher stopped`);this.watchers.clear()}updateConfig(e){this.stop(),this.config={...this.config,...e},this.start()}setAutoDeploy(e){this.config.autoDeploy=e}onFileChanged(e){this.onFileChange=e}getWatchedPaths(){let e=[];return this.config.agentsRoot&&e.push({type:"agent",path:this.config.agentsRoot}),this.config.promptsRoot&&e.push({type:"prompt",path:this.config.promptsRoot}),this.config.instructionsRoot&&e.push({type:"instruction",path:this.config.instructionsRoot}),e}};var an=P(require("vscode")),rn=class{statusBarItem;currentAgent=null;currentPlan=null;constructor(){this.statusBarItem=an.window.createStatusBarItem(an.StatusBarAlignment.Left,100),this.statusBarItem.command="projectMemory.showDashboard",this.updateDisplay(),this.statusBarItem.show()}setCurrentAgent(e){this.currentAgent=e,this.updateDisplay()}setCurrentPlan(e){this.currentPlan=e,this.updateDisplay()}updateDisplay(){this.currentAgent&&this.currentPlan?(this.statusBarItem.text=`$(robot) ${this.currentAgent} \xB7 ${this.currentPlan}`,this.statusBarItem.tooltip=`Project Memory: ${this.currentAgent} working on "${this.currentPlan}"`):this.currentAgent?(this.statusBarItem.text=`$(robot) ${this.currentAgent}`,this.statusBarItem.tooltip=`Project Memory: ${this.currentAgent} active`):(this.statusBarItem.text="$(robot) Project Memory",this.statusBarItem.tooltip="Click to open Project Memory Dashboard")}showTemporaryMessage(e,t=3e3){let s=this.statusBarItem.text,n=this.statusBarItem.tooltip;this.statusBarItem.text=`$(sync~spin) ${e}`,this.statusBarItem.tooltip=e,setTimeout(()=>{this.statusBarItem.text=s,this.statusBarItem.tooltip=n},t)}setCopilotStatus(e){e.agents+e.prompts+e.instructions>0?(this.statusBarItem.text=`$(robot) PM (${e.agents}A/${e.prompts}P/${e.instructions}I)`,this.statusBarItem.tooltip=`Project Memory
Agents: ${e.agents}
Prompts: ${e.prompts}
Instructions: ${e.instructions}`):this.updateDisplay()}dispose(){this.statusBarItem.dispose()}};var ie=P(require("vscode")),hn=require("child_process"),ii=P(require("path"));var Mo=require("child_process");var Ao=P(require("http")),Re=P(require("path")),Ze=P(require("vscode")),To=require("child_process");function cn(o){return new Promise(e=>{let t=Ao.get(`http://localhost:${o}/api/health`,s=>{if(s.statusCode!==200){e(!1),s.resume();return}let n="";s.on("data",r=>{n+=r.toString()}),s.on("end",()=>{try{let r=JSON.parse(n);e(r?.status==="ok")}catch{e(!1)}})});t.on("error",()=>e(!1)),t.setTimeout(1e3,()=>{t.destroy(),e(!1)})})}function Io(o){return new Promise(e=>{let t=Ao.get(`http://localhost:${o}`,s=>{e(s.statusCode!==void 0)});t.on("error",()=>e(!1)),t.setTimeout(1e3,()=>{t.destroy(),e(!1)})})}async function Zr(o,e){let t=Date.now();for(;Date.now()-t<e;){try{if(await cn(o))return!0}catch{}await si(500)}return!1}async function ei(o,e){let t=Date.now();for(;Date.now()-t<e;){try{if(await Io(o))return!0}catch{}await si(500)}return!1}function ln(o){return new Promise(e=>{if(process.platform==="win32"){(0,To.exec)(`netstat -ano -p tcp | findstr :${o}`,{windowsHide:!0},(t,s)=>{if(t||!s){e(null);return}let n=s.split(/\r?\n/).map(r=>r.trim()).filter(Boolean);for(let r of n){if(!r.includes(`:${o}`)||!/LISTENING/i.test(r))continue;let i=r.match(/LISTENING\s+(\d+)/i);if(i){e(Number(i[1]));return}}e(null)});return}(0,To.exec)(`lsof -iTCP:${o} -sTCP:LISTEN -t`,(t,s)=>{if(t||!s){e(null);return}let n=s.split(/\r?\n/).find(i=>i.trim().length>0);if(!n){e(null);return}let r=Number(n.trim());e(Number.isNaN(r)?null:r)})})}function ti(o){let e=Ze.extensions.getExtension("project-memory.project-memory-dashboard")?.extensionPath,t=Ze.workspace.workspaceFolders?.[0]?.uri.fsPath,s=[e?Re.join(e,"server"):null,"c:\\Users\\codi.f\\vscode_ModularAgenticProcedureSystem\\dashboard\\server","c:\\Users\\User\\Project_Memory_MCP\\Project-Memory-MCP\\dashboard\\server",t?Re.join(t,"dashboard","server"):null,e?Re.join(e,"..","dashboard","server"):null].filter(Boolean),n=require("fs");for(let r of s)if(n.existsSync(Re.join(r,"package.json")))return o?.(`Found server at: ${r}`),r;return null}function ni(o){let e=Ze.extensions.getExtension("project-memory.project-memory-dashboard")?.extensionPath,t=Ze.workspace.workspaceFolders?.[0]?.uri.fsPath,s=[e?Re.join(e,"dashboard"):null,"c:\\Users\\codi.f\\vscode_ModularAgenticProcedureSystem\\dashboard","c:\\Users\\User\\Project_Memory_MCP\\Project-Memory-MCP\\dashboard",t?Re.join(t,"dashboard"):null,e?Re.join(e,"..","dashboard"):null].filter(Boolean),n=require("fs");for(let r of s)if(n.existsSync(Re.join(r,"package.json")))return o?.(`Found dashboard at: ${r}`),r;return o?.("Could not find dashboard directory for frontend"),null}async function oi(o,e){let t=Date.now(),s=await o(),n=Date.now()-t;return e.apiCalls++,e.avgResponseTime=(e.avgResponseTime*(e.apiCalls-1)+n)/e.apiCalls,e.lastCheck=Date.now(),s}function si(o){return new Promise(e=>setTimeout(e,o))}var dn=class{frontendProcess=null;_isFrontendRunning=!1;_isExternalFrontend=!1;logger;config;constructor(e,t){this.config=e,this.logger=t}get isRunning(){return this._isFrontendRunning}get isExternal(){return this._isExternalFrontend}async start(){if(this._isFrontendRunning)return this.logger("Frontend is already running"),!0;if(await Io(5173))return this.logger("Found existing frontend on port 5173 - using it"),this._isFrontendRunning=!0,this._isExternalFrontend=!0,!0;let t=ni(this.logger);if(!t)return this.logger("Could not find dashboard directory for frontend"),!1;this.logger(`Starting frontend from: ${t}`);try{let s=process.platform==="win32"?"npm.cmd":"npm",n=["run","dev"];return this.frontendProcess=(0,Mo.spawn)(s,n,{cwd:t,shell:!0,windowsHide:!0,env:{...process.env,VITE_API_URL:`http://localhost:${this.config.serverPort||3001}`}}),this.frontendProcess.stdout?.on("data",i=>{this.logger(`[frontend] ${i.toString().trim()}`)}),this.frontendProcess.stderr?.on("data",i=>{this.logger(`[frontend] ${i.toString().trim()}`)}),this.frontendProcess.on("error",i=>{this.logger(`Frontend error: ${i.message}`),this._isFrontendRunning=!1}),this.frontendProcess.on("exit",(i,a)=>{this.logger(`Frontend exited with code ${i}, signal ${a}`),this._isFrontendRunning=!1,this.frontendProcess=null}),await ei(5173,15e3)?(this._isFrontendRunning=!0,this.logger("Frontend started successfully on port 5173"),!0):(this.logger("Frontend failed to start within timeout"),!1)}catch(s){return this.logger(`Failed to start frontend: ${s}`),!1}}async stop(){if(this._isExternalFrontend){this.logger("Disconnecting from external frontend (not stopping it)"),this._isFrontendRunning=!1,this._isExternalFrontend=!1;return}if(this.frontendProcess)return this.logger("Stopping frontend..."),new Promise(e=>{if(!this.frontendProcess){e();return}let t=setTimeout(()=>{this.frontendProcess&&(this.logger("Force killing frontend..."),this.frontendProcess.kill("SIGKILL")),e()},5e3);this.frontendProcess.on("exit",()=>{clearTimeout(t),this._isFrontendRunning=!1,this.frontendProcess=null,this.logger("Frontend stopped"),e()}),process.platform==="win32"?(0,Mo.spawn)("taskkill",["/pid",String(this.frontendProcess.pid),"/f","/t"],{windowsHide:!0}):this.frontendProcess.kill("SIGTERM")})}dispose(){this.stop()}};var Ie=P(require("fs")),Ee=P(require("path")),Ml=1024*1024;function $o(o,e,t){try{let s=Ee.join(o,"logs");Ie.mkdirSync(s,{recursive:!0});let n=Ee.join(s,e);try{if(Ie.statSync(n).size>Ml){let i=Ee.basename(e,Ee.extname(e)),a=Ee.extname(e),c=Ee.join(s,`${i}.${Date.now()}${a}`);Ie.renameSync(n,c)}}catch{}Ie.appendFileSync(n,t+`
`)}catch{}}function ri(o,e,t={}){let s=JSON.stringify({timestamp:new Date().toISOString(),event:e,...t});$o(o,"process-audit.log",s)}var Me=P(require("fs")),un=P(require("path")),pn=class{lockfilePath;windowId;constructor(e){this.lockfilePath=un.join(e,"server.lock"),this.windowId=`${process.pid}-${Math.random().toString(36).slice(2,8)}`}acquire(e){let t=this.read();return t&&this.isProcessAlive(t.pid)?!1:(this.write(e),!0)}release(){let e=this.read();if(e&&e.windowId===this.windowId)try{Me.unlinkSync(this.lockfilePath)}catch{}}isOwner(){return this.read()?.windowId===this.windowId}isOwnedByOther(){let e=this.read();return!e||e.windowId===this.windowId?!1:this.isProcessAlive(e.pid)}isStale(){let e=this.read();return e?!this.isProcessAlive(e.pid):!1}read(){try{let e=Me.readFileSync(this.lockfilePath,"utf-8");return JSON.parse(e)}catch{return null}}write(e){let t={pid:process.pid,port:e,windowId:this.windowId,timestamp:new Date().toISOString()};try{Me.mkdirSync(un.dirname(this.lockfilePath),{recursive:!0}),Me.writeFileSync(this.lockfilePath,JSON.stringify(t,null,2))}catch(s){console.error("Failed to write PID lockfile:",s)}}isProcessAlive(e){try{return process.kill(e,0),!0}catch{return!1}}};function Do(o,...e){return ie.workspace.getConfiguration("projectMemory").get("showNotifications",!0)?ie.window.showInformationMessage(o,...e):Promise.resolve(void 0)}var gn=class{serverProcess=null;ownedServerPid=null;outputChannel;statusBarItem;_isRunning=!1;_isExternalServer=!1;_isContainerMode=!1;_containerHealthTimer=null;_intentionalStop=!1;config;restartAttempts=0;maxRestartAttempts=3;_performanceStats={apiCalls:0,avgResponseTime:0,lastCheck:Date.now()};frontendManager;idleCheckTimer=null;lastActivityTime=Date.now();lockfile;constructor(e){this.config=e,this.outputChannel=ie.window.createOutputChannel("Project Memory Server"),this.statusBarItem=ie.window.createStatusBarItem(ie.StatusBarAlignment.Right,100),this.statusBarItem.command="projectMemory.toggleServer",this.lockfile=new pn(e.dataRoot),this.frontendManager=new dn({serverPort:e.serverPort||3001},t=>this.log(t))}get isRunning(){return this._isRunning}get isFrontendRunning(){return this.frontendManager.isRunning}get isExternalServer(){return this._isExternalServer}get isContainerMode(){return this._isContainerMode}get performanceStats(){return{...this._performanceStats}}startIdleMonitoring(e){e<=0||(this.resetIdleTimer(),this.log(`Idle server timeout enabled: ${e} minutes`),this.idleCheckTimer=setInterval(()=>{if(!this._isRunning||this._isExternalServer)return;let t=Date.now()-this.lastActivityTime,s=e*60*1e3;t>=s&&(this.log(`Server idle for ${Math.floor(t/6e4)}min \u2014 shutting down`),this.logEvent("server_idle_shutdown",{idleMinutes:Math.floor(t/6e4),timeoutMinutes:e}),this.stop(),Do("Project Memory server stopped due to inactivity. It will restart on next use."))},6e4))}resetIdleTimer(){this.lastActivityTime=Date.now()}stopIdleMonitoring(){this.idleCheckTimer&&(clearInterval(this.idleCheckTimer),this.idleCheckTimer=null)}async start(){if(this._isRunning)return this.log("Server is already running"),!0;let e=this.config.serverPort||3001,t=Sn();if(t!=="local"){this.log(`Container mode: ${t} \u2014 probing for container...`);let{useContainer:r,status:i}=await es();if(r&&i.detected)return this.log(`Container detected: MCP=${i.mcpHealthy}, Dashboard=${i.dashboardHealthy}`),this.logEvent("server_connected_container",{port:e,mcpPort:Dt(),mcpHealthy:i.mcpHealthy,dashboardHealthy:i.dashboardHealthy}),this._isRunning=!0,this._isExternalServer=!0,this._isContainerMode=!0,this.restartAttempts=0,this.updateStatusBar("container"),this.startContainerHealthMonitor(),Do("Connected to Project Memory container"),!0;if(t==="container")return this.log("Container mode forced but container not detected"),this.updateStatusBar("error"),ie.window.showWarningMessage('Project Memory: Container mode is set but no container was detected. Start the container with `run-container.ps1 run` or change containerMode to "auto".'),!1;this.log("No container detected \u2014 falling back to local server")}if(this.lockfile.isOwnedByOther()&&this.log("Another VS Code window owns the server \u2014 connecting as external"),this.log(`Checking if server already exists on port ${e}...`),await cn(e))return this.log("Found existing server - connecting without spawning new process"),this.logEvent("server_connected_external",{port:e}),this._isRunning=!0,this._isExternalServer=!0,this.restartAttempts=0,this.updateStatusBar("connected"),Do("Connected to existing Project Memory server"),!0;let n=this.getServerDirectory();if(!n)return this.log("Dashboard server directory not found"),!1;this.log(`Starting server from: ${n}`),this._isExternalServer=!1,this.updateStatusBar("starting");try{let r={...process.env,PORT:String(this.config.serverPort||3001),WS_PORT:String(this.config.wsPort||3002),MBS_DATA_ROOT:this.config.dataRoot,MBS_AGENTS_ROOT:this.config.agentsRoot,MBS_PROMPTS_ROOT:this.config.promptsRoot||"",MBS_INSTRUCTIONS_ROOT:this.config.instructionsRoot||""},i=ii.join(n,"dist","index.js"),a=require("fs"),c,l;return a.existsSync(i)?(c="node",l=[i]):(c=process.platform==="win32"?"npx.cmd":"npx",l=["tsx","src/index.ts"]),this.serverProcess=(0,hn.spawn)(c,l,{cwd:n,env:r,shell:!0,windowsHide:!0}),this.serverProcess.stdout?.on("data",d=>this.log(d.toString().trim())),this.serverProcess.stderr?.on("data",d=>this.log(`[stderr] ${d.toString().trim()}`)),this.serverProcess.on("error",d=>{this.log(`Server error: ${d.message}`),this._isRunning=!1,this.updateStatusBar("error")}),this.serverProcess.on("exit",(d,u)=>{this.log(`Server exited with code ${d}, signal ${u}`),this._isRunning=!1,this.serverProcess=null,this.ownedServerPid=null,this._intentionalStop?(this.log("Intentional stop - not auto-restarting"),this._intentionalStop=!1,this.updateStatusBar("stopped")):d!==0&&this.restartAttempts<this.maxRestartAttempts?(this.restartAttempts++,this.log(`Attempting restart (${this.restartAttempts}/${this.maxRestartAttempts})...`),setTimeout(()=>this.start(),2e3)):this.updateStatusBar("stopped")}),await Zr(e,1e4)?(this._isRunning=!0,this.restartAttempts=0,this.ownedServerPid=await ln(e),this.ownedServerPid&&this.log(`Server process id: ${this.ownedServerPid}`),this.updateStatusBar("running"),this.log("Server started successfully"),this.logEvent("server_spawned",{pid:this.ownedServerPid,port:e,serverDir:n}),this.lockfile.acquire(e),!0):(this.log("Server failed to start within timeout"),this.stop(),!1)}catch(r){return this.log(`Failed to start server: ${r}`),this.updateStatusBar("error"),!1}}async stop(){if(this._intentionalStop=!0,this.stopContainerHealthMonitor(),this._isExternalServer){this.log("Disconnecting from external server (not stopping it)"),this._intentionalStop=!1,this._isRunning=!1,this._isExternalServer=!1,this._isContainerMode=!1,this.updateStatusBar("stopped");return}if(!this.serverProcess&&this.ownedServerPid){this.log(`Stopping tracked server pid ${this.ownedServerPid}`),this.killPid(this.ownedServerPid),this.ownedServerPid=null,this._isRunning=!1,this.updateStatusBar("stopped");return}if(this.serverProcess)return this.log("Stopping server..."),this.updateStatusBar("stopping"),new Promise(e=>{if(!this.serverProcess){e();return}let t=setTimeout(()=>{this.serverProcess&&(this.log("Force killing server..."),this.serverProcess.kill("SIGKILL")),e()},5e3);this.serverProcess.on("exit",()=>{clearTimeout(t),this._isRunning=!1,this.serverProcess=null,this.ownedServerPid=null,this.updateStatusBar("stopped"),this.log("Server stopped"),this.logEvent("server_stopped",{pid:this.ownedServerPid}),this.lockfile.release(),e()}),process.platform==="win32"?(0,hn.spawn)("taskkill",["/pid",String(this.serverProcess.pid),"/f","/t"],{windowsHide:!0}):this.serverProcess.kill("SIGTERM")})}async forceStopOwnedServer(){if(this._isExternalServer)return!1;this._intentionalStop=!0;let e=this.config.serverPort||3001,t=this.ownedServerPid||await ln(e);return t?(this.log(`Force stopping owned server on port ${e} (pid ${t})`),this.logEvent("server_force_kill",{pid:t,port:e,trigger:"forceStopOwnedServer"}),this.killPid(t),this.ownedServerPid=null,this._isRunning=!1,this.updateStatusBar("stopped"),!0):(this.log(`No owned server process found on port ${e}`),!1)}async forceStopExternalServer(){if(this.serverProcess&&!this._isExternalServer)return this.log("Server was started by this extension; use Stop Server instead"),!1;this._intentionalStop=!0;let e=this.config.serverPort||3001,t=await ln(e);return t?(this.log(`Force stopping server on port ${e} (pid ${t})`),this.logEvent("server_force_kill",{pid:t,port:e,trigger:"forceStopExternalServer"}),this.killPid(t),await new Promise(n=>setTimeout(n,1e3)),await cn(e)?(this.log("Server still responding after force stop"),!1):(this._isRunning=!1,this._isExternalServer=!1,this.updateStatusBar("stopped"),this.log("External server stopped"),!0)):(this.log(`No process found listening on port ${e}`),!1)}async restart(){return await this.stop(),this.start()}async startFrontend(){return this.frontendManager.start()}async stopFrontend(){return this.frontendManager.stop()}updateConfig(e){this.config={...this.config,...e},this._isRunning&&this.restart()}hasServerDirectory(){return this.getServerDirectory()!==null}getServerDirectory(){return ti(e=>this.log(e))}async measureApiCall(e){return oi(e,this._performanceStats)}updateStatusBar(e){let t={starting:"$(loading~spin)",running:"$(check)",connected:"$(plug)",container:"$(package)",stopping:"$(loading~spin)",stopped:"$(circle-slash)",error:"$(error)"},s={running:new ie.ThemeColor("statusBarItem.prominentBackground"),connected:new ie.ThemeColor("statusBarItem.prominentBackground"),container:new ie.ThemeColor("statusBarItem.prominentBackground"),error:new ie.ThemeColor("statusBarItem.errorBackground")},n={starting:"PM Server",running:"PM Server (local)",connected:"PM Server (shared)",container:"PM Server (container)",stopping:"PM Server",stopped:"PM Server",error:"PM Server"},r=this._isContainerMode?" (container)":this._isExternalServer?" (connected to existing)":"";this.statusBarItem.text=`${t[e]} ${n[e]||"PM Server"}`,this.statusBarItem.tooltip=`Project Memory Server: ${e}${r}
Click to toggle`,this.statusBarItem.backgroundColor=s[e],this.statusBarItem.show()}startContainerHealthMonitor(){this.stopContainerHealthMonitor(),this._containerHealthTimer=setInterval(async()=>{if(!this._isContainerMode||!this._isRunning)return;let e=Dt(),t=this.config.serverPort||3001;if(!(await Pn(e,t)).detected){this.log("Container health check failed \u2014 container unreachable"),this.logEvent("container_disconnected",{mcpPort:e,dashPort:t}),this._isRunning=!1,this._isExternalServer=!1,this._isContainerMode=!1,this.stopContainerHealthMonitor(),this.updateStatusBar("error");let n=await ie.window.showWarningMessage("Project Memory: Container connection lost. The container may have stopped.","Retry Container","Start Local","Dismiss");if(n==="Retry Container")this.start();else if(n==="Start Local"){this._isContainerMode=!1;let r=this.start.bind(this);this.log("Falling back to local server..."),await r()}}},3e4)}stopContainerHealthMonitor(){this._containerHealthTimer&&(clearInterval(this._containerHealthTimer),this._containerHealthTimer=null)}killPid(e){if(process.platform==="win32")(0,hn.spawn)("taskkill",["/pid",String(e),"/f","/t"],{windowsHide:!0});else try{process.kill(e,"SIGKILL")}catch(t){this.log(`Failed to kill pid ${e}: ${t}`)}}log(e){let s=`[${new Date().toISOString()}] ${e}`;this.outputChannel.appendLine(s),$o(this.config.dataRoot,"server-manager.log",s)}logEvent(e,t={}){this.log(`EVENT: ${e} ${JSON.stringify(t)}`),ri(this.config.dataRoot,e,t)}showLogs(){this.outputChannel.show()}dispose(){this.stopIdleMonitoring(),this.stopContainerHealthMonitor(),this.lockfile.release(),this.stop(),this.frontendManager.dispose(),this.outputChannel.dispose(),this.statusBarItem.dispose()}};var ai=P(require("vscode")),Y=P(require("fs")),ee=P(require("path")),fn=class{outputChannel;config;constructor(e){this.config=e,this.outputChannel=ai.window.createOutputChannel("Project Memory Deployment")}updateConfig(e){this.config={...this.config,...e}}async deployToWorkspace(e){let t=[],s=[];this.log(`Deploying defaults to workspace: ${e}`);let n=ee.join(e,".github","agents");for(let i of this.config.defaultAgents)try{await this.deployAgent(i,n)&&t.push(i)}catch(a){this.log(`Failed to deploy agent ${i}: ${a}`)}let r=ee.join(e,".github","instructions");for(let i of this.config.defaultInstructions)try{await this.deployInstruction(i,r)&&s.push(i)}catch(a){this.log(`Failed to deploy instruction ${i}: ${a}`)}return this.log(`Deployed ${t.length} agents, ${s.length} instructions`),{agents:t,instructions:s}}async deployAgent(e,t){let s=ee.join(this.config.agentsRoot,`${e}.agent.md`),n=ee.join(t,`${e}.agent.md`);return this.copyFile(s,n)}async deployInstruction(e,t){let s=ee.join(this.config.instructionsRoot,`${e}.instructions.md`),n=ee.join(t,`${e}.instructions.md`);return this.copyFile(s,n)}async updateWorkspace(e){let t=[],s=[],n=ee.join(e,".github","agents"),r=ee.join(e,".github","instructions");for(let i of this.config.defaultAgents){let a=ee.join(this.config.agentsRoot,`${i}.agent.md`),c=ee.join(n,`${i}.agent.md`);if(Y.existsSync(a))if(Y.existsSync(c)){let l=Y.statSync(a),p=Y.statSync(c);l.mtimeMs>p.mtimeMs&&(await this.copyFile(a,c,!0),t.push(i))}else await this.copyFile(a,c),s.push(i)}for(let i of this.config.defaultInstructions){let a=ee.join(this.config.instructionsRoot,`${i}.instructions.md`),c=ee.join(r,`${i}.instructions.md`);if(Y.existsSync(a))if(Y.existsSync(c)){let l=Y.statSync(a),p=Y.statSync(c);l.mtimeMs>p.mtimeMs&&(await this.copyFile(a,c,!0),t.push(i))}else await this.copyFile(a,c),s.push(i)}return{updated:t,added:s}}getDeploymentPlan(){let e=this.config.defaultAgents.filter(s=>{let n=ee.join(this.config.agentsRoot,`${s}.agent.md`);return Y.existsSync(n)}),t=this.config.defaultInstructions.filter(s=>{let n=ee.join(this.config.instructionsRoot,`${s}.instructions.md`);return Y.existsSync(n)});return{agents:e,instructions:t}}async copyFile(e,t,s=!1){if(!Y.existsSync(e))return this.log(`Source not found: ${e}`),!1;if(Y.existsSync(t)&&!s)return this.log(`Target exists, skipping: ${t}`),!1;let n=ee.dirname(t);return Y.existsSync(n)||Y.mkdirSync(n,{recursive:!0}),Y.copyFileSync(e,t),this.log(`Copied: ${e} -> ${t}`),!0}log(e){let t=new Date().toISOString();this.outputChannel.appendLine(`[${t}] ${e}`)}showLogs(){this.outputChannel.show()}dispose(){this.outputChannel.dispose()}};var et=P(require("vscode")),mn=P(require("http"));var Ct=class{connected=!1;serverPort=3001;serverHost="localhost";outputChannel;reconnectAttempts=0;maxReconnectAttempts=3;reconnectDelay=1e3;config;_onConnectionChange=new et.EventEmitter;onConnectionChange=this._onConnectionChange.event;constructor(e){this.config=e,this.outputChannel=et.window.createOutputChannel("Project Memory MCP Bridge");let t=et.workspace.getConfiguration("projectMemory");this.serverPort=t.get("serverPort")||3001}async connect(){if(this.connected){this.log("Already connected");return}try{let e=await this.httpGet("/api/health");if(e.status==="ok")this.connected=!0,this.reconnectAttempts=0,this._onConnectionChange.fire(!0),this.log(`Connected to shared server at localhost:${this.serverPort}`),this.log(`Data root: ${e.dataRoot}`);else throw new Error("Server health check failed")}catch(e){throw this.log(`Connection failed: ${e}`),this.connected=!1,this._onConnectionChange.fire(!1),new Error(`Could not connect to Project Memory server.
Please ensure the server is running (check PM Server status bar item).`)}}async disconnect(){this.connected&&(this.connected=!1,this._onConnectionChange.fire(!1),this.log("Disconnected from server"))}isConnected(){return this.connected}async reconnect(){this.connected=!1,this._onConnectionChange.fire(!1),await this.connect()}async callTool(e,t){if(!this.connected)throw new Error("Not connected to Project Memory server");this.log(`Calling tool: ${e} with args: ${JSON.stringify(t)}`);try{let s=await this.mapToolToHttp(e,t);return this.log(`Tool ${e} result: ${JSON.stringify(s).substring(0,200)}...`),s}catch(s){throw this.log(`Tool ${e} error: ${s}`),s}}async mapToolToHttp(e,t){switch(e){case"memory_workspace":return this.handleMemoryWorkspace(t);case"memory_plan":return this.handleMemoryPlan(t);case"memory_steps":return this.handleMemorySteps(t);case"memory_context":return this.handleMemoryContext(t);case"memory_agent":return this.handleMemoryAgent(t);case"register_workspace":return{workspace:{workspace_id:(await this.registerWorkspace(t.workspace_path)).workspace.workspace_id}};case"get_workspace_info":return this.handleMemoryWorkspace({action:"info",workspace_id:t.workspace_id});case"list_workspaces":return this.handleMemoryWorkspace({action:"list"});case"create_plan":return this.handleMemoryPlan({action:"create",workspace_id:t.workspace_id,title:t.title,description:t.description,category:t.category,priority:t.priority,goals:t.goals,success_criteria:t.success_criteria,template:t.template});case"get_plan_state":return this.handleMemoryPlan({action:"get",workspace_id:t.workspace_id,plan_id:t.plan_id});case"list_plans":return this.handleMemoryPlan({action:"list",workspace_id:t.workspace_id});case"update_step":return this.handleMemorySteps({action:"update",workspace_id:t.workspace_id,plan_id:t.plan_id,step_index:t.step_index??t.step_id,status:t.status,notes:t.notes});case"append_steps":return this.handleMemorySteps({action:"add",workspace_id:t.workspace_id,plan_id:t.plan_id,steps:t.steps});case"add_note":return this.handleMemoryPlan({action:"add_note",workspace_id:t.workspace_id,plan_id:t.plan_id,note:t.note,note_type:t.type||"info"});case"handoff":return this.handleMemoryAgent({action:"handoff",workspace_id:t.workspace_id,plan_id:t.plan_id,from_agent:t.from_agent,to_agent:t.to_agent??t.target_agent,reason:t.reason,summary:t.summary,artifacts:t.artifacts});case"get_lineage":return this.httpGet(`/api/plans/${t.workspace_id}/${t.plan_id}/lineage`);case"store_context":return this.handleMemoryContext({action:"store",workspace_id:t.workspace_id,plan_id:t.plan_id,type:t.type,data:t.data});case"get_context":return this.handleMemoryContext({action:"get",workspace_id:t.workspace_id,plan_id:t.plan_id,type:t.type});case"initialise_agent":return this.handleMemoryAgent({action:"init",...t});case"complete_agent":return this.handleMemoryAgent({action:"complete",...t});case"search":return this.httpGet(`/api/search?q=${encodeURIComponent(t.query)}`);default:throw new Error(`Unknown tool: ${e}`)}}async registerWorkspace(e){let t=ge(e),s=t?t.projectPath:e,r=(await this.httpGet("/api/workspaces")).workspaces.find(a=>a.path?.toLowerCase()===s.toLowerCase());return r?{workspace:{workspace_id:r.id}}:{workspace:{workspace_id:t?t.workspaceId:dt(s)}}}pathToWorkspaceId(e){let t=ge(e);return t?t.workspaceId:dt(e)}async listTools(){return[{name:"memory_workspace",description:"Workspace management (register, list, info, reindex)"},{name:"memory_plan",description:"Plan management (list, get, create, archive, add_note)"},{name:"memory_steps",description:"Step management (update, batch_update, add)"},{name:"memory_context",description:"Context management (store, get)"},{name:"memory_agent",description:"Agent lifecycle and handoffs"},{name:"register_workspace",description:"Register a workspace"},{name:"list_workspaces",description:"List all workspaces"},{name:"get_workspace_info",description:"Get workspace details"},{name:"create_plan",description:"Create a new plan"},{name:"get_plan_state",description:"Get plan state"},{name:"list_plans",description:"List plans for a workspace"},{name:"update_step",description:"Update a plan step"},{name:"append_steps",description:"Add steps to a plan"},{name:"add_note",description:"Add a note to a plan"},{name:"handoff",description:"Hand off between agents"},{name:"get_lineage",description:"Get handoff lineage"},{name:"store_context",description:"Store context data"},{name:"get_context",description:"Get context data"},{name:"initialise_agent",description:"Initialize an agent session"},{name:"complete_agent",description:"Complete an agent session"},{name:"search",description:"Search across workspaces"}]}async handleMemoryWorkspace(e){let t=e.action;switch(t){case"register":return{workspace_id:(await this.registerWorkspace(e.workspace_path)).workspace.workspace_id};case"list":return this.httpGet("/api/workspaces");case"info":return this.httpGet(`/api/workspaces/${e.workspace_id}`);case"reindex":throw new Error("Workspace reindex is not available via the HTTP bridge.");default:throw new Error(`Unknown memory_workspace action: ${t}`)}}async handleMemoryPlan(e){let t=e.action,s=e.workspace_id,n=e.plan_id;if(!s)throw new Error("workspace_id is required");switch(t){case"list":{let r=await this.httpGet(`/api/plans/workspace/${s}`);return{active_plans:this.normalizePlanSummaries(r.plans||[]),total:r.total}}case"get":{if(!n)throw new Error("plan_id is required");let r=await this.httpGet(`/api/plans/${s}/${n}`);return this.normalizePlanState(r)}case"create":{let r=e.title,i=e.description;if(!r||!i)throw new Error("title and description are required");let a=e.template,c={title:r,description:i,category:e.category||"feature",priority:e.priority||"medium",goals:e.goals,success_criteria:e.success_criteria},l=a?await this.httpPost(`/api/plans/${s}/template`,{...c,template:a}):await this.httpPost(`/api/plans/${s}`,c);if(l&&typeof l=="object"&&"plan"in l){let p=l;if(p.plan)return this.normalizePlanState(p.plan)}return this.normalizePlanState(l)}case"archive":{if(!n)throw new Error("plan_id is required");return this.httpPost(`/api/plans/${s}/${n}/archive`,{})}case"add_note":{if(!n)throw new Error("plan_id is required");return this.httpPost(`/api/plans/${s}/${n}/notes`,{note:e.note,type:e.note_type||"info"})}default:throw new Error(`Unknown memory_plan action: ${t}`)}}async handleMemorySteps(e){let t=e.action,s=e.workspace_id,n=e.plan_id;if(!s||!n)throw new Error("workspace_id and plan_id are required");let r=await this.getPlanState(s,n),i=Array.isArray(r.steps)?[...r.steps]:[];switch(t){case"update":{let a=this.toStepIndex(e.step_index);if(a===null)throw new Error("step_index is required");if(!i[a])throw new Error(`Step index out of range: ${a}`);return e.status&&(i[a].status=e.status),e.notes&&(i[a].notes=e.notes),this.updatePlanSteps(s,n,i)}case"batch_update":{let a=e.updates;if(!a||a.length===0)throw new Error("updates array is required");for(let c of a){let l=this.toStepIndex(c.step_index);if(l===null||!i[l])throw new Error(`Step index out of range: ${c.step_index}`);c.status&&(i[l].status=c.status),c.notes&&(i[l].notes=c.notes)}return this.updatePlanSteps(s,n,i)}case"add":{let a=e.steps||[];if(a.length===0)throw new Error("steps array is required");let c=i.length,l=a.map((d,u)=>({index:c+u,phase:d.phase,task:d.task,status:d.status||"pending",type:d.type,assignee:d.assignee,requires_validation:d.requires_validation,notes:d.notes})),p=i.concat(l);return this.updatePlanSteps(s,n,p)}default:throw new Error(`Unknown memory_steps action: ${t}`)}}async handleMemoryContext(e){let t=e.action,s=e.workspace_id,n=e.plan_id;if(!s||!n)throw new Error("workspace_id and plan_id are required");switch(t){case"store":return this.httpPost(`/api/plans/${s}/${n}/context`,{type:e.type,data:e.data});case"get":{if(!e.type)throw new Error("type is required for context get");return this.httpGet(`/api/plans/${s}/${n}/context/${e.type}`)}case"store_initial":return this.httpPost(`/api/plans/${s}/${n}/context/initial`,{user_request:e.user_request,files_mentioned:e.files_mentioned,file_contents:e.file_contents,requirements:e.requirements,constraints:e.constraints,examples:e.examples,conversation_context:e.conversation_context,additional_notes:e.additional_notes});case"list":return(await this.httpGet(`/api/plans/${s}/${n}/context`)).context||[];case"list_research":return(await this.httpGet(`/api/plans/${s}/${n}/context/research`)).notes||[];case"append_research":return this.httpPost(`/api/plans/${s}/${n}/research`,{filename:e.filename,content:e.content});case"batch_store":{let r=Array.isArray(e.items)?e.items:[];if(r.length===0)throw new Error("items array is required for batch_store");let i=[];for(let a of r){let c=await this.httpPost(`/api/plans/${s}/${n}/context`,{type:a.type,data:a.data});i.push({type:a.type,result:c})}return{stored:i}}case"generate_instructions":throw new Error("generate_instructions is not available via the HTTP bridge.");default:throw new Error(`Unknown memory_context action: ${t}`)}}async handleMemoryAgent(e){let t=e.action,s=e.workspace_id,n=e.plan_id;switch(t){case"get_briefing":{if(!s||!n)throw new Error("workspace_id and plan_id are required");let r=await this.getPlanState(s,n),i=await this.httpGet(`/api/plans/${s}/${n}/lineage`);return{plan:this.normalizePlanState(r),lineage:i}}case"handoff":{if(!s||!n)throw new Error("workspace_id and plan_id are required");let r=e.to_agent||e.target_agent;if(!r)throw new Error("to_agent is required");let i=e.summary||e.reason||"Handoff requested";return this.httpPost(`/api/plans/${s}/${n}/handoff`,{from_agent:e.from_agent||e.agent_type||"Unknown",to_agent:r,reason:e.reason||i,summary:i,artifacts:e.artifacts})}case"init":case"complete":throw new Error("Agent sessions are not available via the HTTP bridge.");default:throw new Error(`Unknown memory_agent action: ${t}`)}}async getPlanState(e,t){let s=await this.httpGet(`/api/plans/${e}/${t}`);return this.normalizePlanState(s)}async updatePlanSteps(e,t,s){return this.httpPut(`/api/plans/${e}/${t}/steps`,{steps:s})}normalizePlanState(e){if(!e||typeof e!="object")return e;let t=e;return!t.plan_id&&typeof t.id=="string"&&(t.plan_id=t.id),Array.isArray(t.steps)&&(t.steps=t.steps.map((s,n)=>({index:typeof s.index=="number"?s.index:n,...s}))),t}normalizePlanSummaries(e){return e.map(t=>this.normalizePlanState(t))}toStepIndex(e){if(typeof e=="number"&&Number.isFinite(e))return e;if(typeof e=="string"&&e.trim().length>0){let t=Number(e);if(Number.isFinite(t))return t}return null}showLogs(){this.outputChannel.show()}dispose(){this.disconnect(),this._onConnectionChange.dispose(),this.outputChannel.dispose()}log(e){let t=new Date().toISOString();this.outputChannel.appendLine(`[${t}] ${e}`),console.log(`[MCP Bridge] ${e}`)}httpGet(e){return new Promise((t,s)=>{let n=`http://${this.serverHost}:${this.serverPort}${e}`;this.log(`GET ${n}`);let r=mn.get(n,i=>{let a="";i.on("data",c=>a+=c),i.on("end",()=>{try{if(i.statusCode&&i.statusCode>=400){s(new Error(`HTTP ${i.statusCode}: ${a}`));return}let c=JSON.parse(a);t(c)}catch{s(new Error(`Failed to parse response: ${a}`))}})});r.on("error",s),r.setTimeout(1e4,()=>{r.destroy(),s(new Error("Request timeout"))})})}httpPost(e,t){return this.httpRequest("POST",e,t)}httpPut(e,t){return this.httpRequest("PUT",e,t)}httpRequest(e,t,s){return new Promise((n,r)=>{let i=JSON.stringify(s),a=`http://${this.serverHost}:${this.serverPort}${t}`;this.log(`${e} ${a}`);let c={hostname:this.serverHost,port:this.serverPort,path:t,method:e,headers:{"Content-Type":"application/json","Content-Length":Buffer.byteLength(i)}},l=mn.request(c,p=>{let d="";p.on("data",u=>d+=u),p.on("end",()=>{try{if(p.statusCode&&p.statusCode>=400){r(new Error(`HTTP ${p.statusCode}: ${d}`));return}let u=JSON.parse(d);n(u)}catch{r(new Error(`Failed to parse response: ${d}`))}})});l.on("error",r),l.setTimeout(1e4,()=>{l.destroy(),r(new Error("Request timeout"))}),l.write(i),l.end()})}};var Te=P(require("vscode"));var Fo={schema:"\u{1F4D0} Schema",config:"\u2699\uFE0F Config",limitation:"\u26A0\uFE0F Limitation","plan-summary":"\u{1F4CB} Plan Summary",reference:"\u{1F4D6} Reference",convention:"\u{1F4CF} Convention"};async function ci(o,e,t,s,n){if(!n)return e.markdown("\u26A0\uFE0F Workspace not registered."),{metadata:{command:"knowledge"}};let r=o.prompt.trim(),i=r.split(/\s+/);switch(i[0]?.toLowerCase()??""){case"list":return await $l(e,s,n);case"show":return await Dl(i[1],e,s,n);case"add":return await Fl(i,r,e,s,n);case"delete":return await Ll(i[1],e,s,n);default:return Bl(e)}}async function $l(o,e,t){o.markdown(`\u{1F4DA} **Knowledge Files**

`),o.progress("Fetching knowledge files\u2026");try{let n=(await e.callTool("memory_context",{action:"knowledge_list",workspace_id:t}))?.files??[];if(n.length===0)return o.markdown("*No knowledge files yet.* Use `/knowledge add {slug}` to create one.\n"),{metadata:{command:"knowledge",action:"list"}};o.markdown(`**${n.length}** file${n.length>1?"s":""} available:

`);for(let r of n){let i=Fo[r.category]??r.category,a=r.updated_at?` \u2014 updated ${new Date(r.updated_at).toLocaleDateString()}`:"";o.markdown(`- **${r.title}** (${i}) \`${r.slug}\`${a}
`)}o.markdown("\nUse `/knowledge show {slug}` to view a file.\n")}catch(s){let n=s instanceof Error?s.message:String(s);o.markdown(`\u26A0\uFE0F Failed to list knowledge files: ${n}
`)}return{metadata:{command:"knowledge",action:"list"}}}async function Dl(o,e,t,s){if(!o)return e.markdown("\u26A0\uFE0F Please provide a slug: `/knowledge show {slug}`\n"),{metadata:{command:"knowledge",action:"show"}};e.progress(`Loading knowledge file "${o}"\u2026`);try{let r=(await t.callTool("memory_context",{action:"knowledge_get",workspace_id:s,slug:o}))?.file;if(!r)return e.markdown(`\u26A0\uFE0F Knowledge file \`${o}\` not found.
`),{metadata:{command:"knowledge",action:"show"}};let i=Fo[r.category]??r.category;e.markdown(`# ${r.title}

`),e.markdown(`**Category**: ${i}  
`),r.tags&&r.tags.length>0&&e.markdown(`**Tags**: ${r.tags.join(", ")}  
`),r.updated_at&&e.markdown(`**Updated**: ${new Date(r.updated_at).toLocaleString()}  
`),r.created_by_agent&&e.markdown(`**Created by**: ${r.created_by_agent}  
`),e.markdown(`
---

`),e.markdown(r.content+`
`)}catch(n){let r=n instanceof Error?n.message:String(n);e.markdown(`\u26A0\uFE0F Failed to load knowledge file: ${r}
`)}return{metadata:{command:"knowledge",action:"show",slug:o}}}async function Fl(o,e,t,s,n){let r=o[1];if(!r)return t.markdown("\u26A0\uFE0F Usage: `/knowledge add {slug} {content}`\n\n"),t.markdown("Example: `/knowledge add api-notes # API Notes\\nThe API uses REST\u2026`\n"),{metadata:{command:"knowledge",action:"add"}};let i=e.indexOf(r)+r.length,a=e.slice(i).trim();if(!a)return t.markdown(`\u26A0\uFE0F Please provide content after the slug.

`),t.markdown("Example: `/knowledge add api-notes # API Notes\\nThe API uses REST\u2026`\n"),{metadata:{command:"knowledge",action:"add"}};let c=r.replace(/-/g," ").replace(/\b\w/g,l=>l.toUpperCase());t.progress(`Creating knowledge file "${r}"\u2026`);try{let l=await s.callTool("memory_context",{action:"knowledge_store",workspace_id:n,slug:r,title:c,content:a,category:"reference"});t.markdown(`\u2705 Knowledge file created: **${l.title??c}** (\`${l.slug??r}\`)

`),t.markdown(`Category: ${Fo[l.category??"reference"]??l.category}

`),t.markdown("Use `/knowledge show "+(l.slug??r)+"` to view it, or edit via the dashboard.\n")}catch(l){let p=l instanceof Error?l.message:String(l);t.markdown(`\u26A0\uFE0F Failed to create knowledge file: ${p}
`)}return{metadata:{command:"knowledge",action:"add",slug:r}}}async function Ll(o,e,t,s){if(!o)return e.markdown("\u26A0\uFE0F Please provide a slug: `/knowledge delete {slug}`\n"),{metadata:{command:"knowledge",action:"delete"}};e.progress(`Deleting knowledge file "${o}"\u2026`);try{await t.callTool("memory_context",{action:"knowledge_delete",workspace_id:s,slug:o}),e.markdown(`\u{1F5D1}\uFE0F Knowledge file \`${o}\` deleted.
`)}catch(n){let r=n instanceof Error?n.message:String(n);e.markdown(`\u26A0\uFE0F Failed to delete knowledge file: ${r}
`)}return{metadata:{command:"knowledge",action:"delete",slug:o}}}function Bl(o){return o.markdown(`\u{1F4DA} **Knowledge Commands**

`),o.markdown("- `/knowledge list` \u2014 List all knowledge files\n"),o.markdown("- `/knowledge show {slug}` \u2014 View a knowledge file\n"),o.markdown("- `/knowledge add {slug} {content}` \u2014 Create a new knowledge file\n"),o.markdown("- `/knowledge delete {slug}` \u2014 Delete a knowledge file\n"),o.markdown(`
Knowledge files store persistent reference material for your workspace \u2014 `),o.markdown(`schemas, conventions, limitations, config notes, and plan summaries.
`),{metadata:{command:"knowledge",action:"help"}}}var Pt=class{participant;mcpBridge;workspaceId=null;constructor(e){this.mcpBridge=e,this.participant=Te.chat.createChatParticipant("project-memory.memory",this.handleRequest.bind(this)),this.participant.iconPath=new Te.ThemeIcon("book"),this.participant.followupProvider={provideFollowups:this.provideFollowups.bind(this)}}async handleRequest(e,t,s,n){if(!this.mcpBridge.isConnected())return s.markdown(`\u26A0\uFE0F **Not connected to MCP server**

Use the "Project Memory: Reconnect Chat to MCP Server" command to reconnect.`),{metadata:{command:"error"}};await this.ensureWorkspaceRegistered(s);try{switch(e.command){case"plan":return await this.handlePlanCommand(e,s,n);case"context":return await this.handleContextCommand(e,s,n);case"handoff":return await this.handleHandoffCommand(e,s,n);case"status":return await this.handleStatusCommand(e,s,n);case"deploy":return await this.handleDeployCommand(e,s,n);case"diagnostics":return await this.handleDiagnosticsCommand(e,s,n);case"knowledge":return await ci(e,s,n,this.mcpBridge,this.workspaceId);default:return await this.handleDefaultCommand(e,s,n)}}catch(r){let i=r instanceof Error?r.message:String(r);return s.markdown(`\u274C **Error**: ${i}`),{metadata:{command:"error"}}}}async ensureWorkspaceRegistered(e){if(this.workspaceId)return;let t=Te.workspace.workspaceFolders?.[0];if(!t){e.markdown(`\u26A0\uFE0F No workspace folder open. Please open a folder first.
`);return}if(!this.mcpBridge.isConnected()){e.markdown(`\u26A0\uFE0F MCP server not connected. Click the MCP status bar item to reconnect.
`);return}try{let s=ge(t.uri.fsPath),n=s?s.projectPath:t.uri.fsPath;console.log(`Registering workspace: ${n}`+(s?" (resolved from identity)":""));let r=await this.mcpBridge.callTool("memory_workspace",{action:"register",workspace_path:n});console.log(`Register workspace result: ${JSON.stringify(r)}`),r.workspace_id?(this.workspaceId=r.workspace_id,console.log(`Workspace registered: ${this.workspaceId}`)):(console.error("Unexpected response format:",r),e.markdown(`\u26A0\uFE0F Unexpected response from MCP server. Check console for details.
`))}catch(s){let n=s instanceof Error?s.message:String(s);console.error("Failed to register workspace:",s),e.markdown(`\u26A0\uFE0F Failed to register workspace: ${n}
`)}}async handlePlanCommand(e,t,s){let n=e.prompt.trim();if(!n||n==="list")return await this.listPlans(t);if(n.startsWith("create "))return await this.createPlan(n.substring(7),t);if(n.startsWith("show ")){let r=n.substring(5).trim();return await this.showPlan(r,t)}return t.markdown(`\u{1F4CB} **Plan Commands**

`),t.markdown("- `/plan list` - List all plans in this workspace\n"),t.markdown("- `/plan create <title>` - Create a new plan\n"),t.markdown("- `/plan show <plan-id>` - Show plan details\n"),t.markdown(`
Or just describe what you want to do and I'll help create a plan.`),{metadata:{command:"plan"}}}async listPlans(e){if(!this.workspaceId)return e.markdown("\u26A0\uFE0F Workspace not registered."),{metadata:{command:"plan"}};e.progress("Fetching plans...");let s=(await this.mcpBridge.callTool("memory_plan",{action:"list",workspace_id:this.workspaceId})).active_plans||[];if(s.length===0)return e.markdown("\u{1F4CB} **No plans found**\n\nUse `/plan create <title>` to create a new plan."),{metadata:{command:"plan"}};e.markdown(`\u{1F4CB} **Plans in this workspace** (${s.length})

`);for(let n of s){let r=this.getStatusEmoji(n.status),i=n.plan_id||n.id||"unknown";e.markdown(`${r} **${n.title}** \`${i}\`
`),n.category&&e.markdown(`   Category: ${n.category}
`)}return{metadata:{command:"plan",plans:s.length}}}async createPlan(e,t){if(!this.workspaceId)return t.markdown("\u26A0\uFE0F Workspace not registered."),{metadata:{command:"plan"}};t.markdown(`\u{1F504} Creating plan: **${e}**...

`);let s=await this.mcpBridge.callTool("memory_plan",{action:"create",workspace_id:this.workspaceId,title:e,description:e,category:"feature"}),n=s.plan_id||s.id||"unknown";return t.markdown(`\u2705 **Plan created!**

`),t.markdown(`- **ID**: \`${n}\`
`),t.markdown(`- **Title**: ${s.title}
`),t.markdown(`
Use \`/plan show ${n}\` to see details.`),{metadata:{command:"plan",action:"created",planId:n}}}async showPlan(e,t){if(!this.workspaceId)return t.markdown("\u26A0\uFE0F Workspace not registered."),{metadata:{command:"plan"}};let s=await this.mcpBridge.callTool("memory_plan",{action:"get",workspace_id:this.workspaceId,plan_id:e}),n=s.plan_id||s.id||e;if(t.markdown(`# \u{1F4CB} ${s.title}

`),t.markdown(`**ID**: \`${n}\`
`),s.category&&t.markdown(`**Category**: ${s.category}
`),s.priority&&t.markdown(`**Priority**: ${s.priority}
`),s.description&&t.markdown(`
${s.description}
`),s.steps&&s.steps.length>0){t.markdown(`
## Steps

`);for(let r=0;r<s.steps.length;r++){let i=s.steps[r],a=this.getStepStatusEmoji(i.status);t.markdown(`${a} **${i.phase}**: ${i.task}
`)}}if(s.lineage&&s.lineage.length>0){t.markdown(`
## Agent History

`);for(let r of s.lineage)t.markdown(`- **${r.agent_type}** (${r.started_at})
`),r.summary&&t.markdown(`  ${r.summary}
`)}return{metadata:{command:"plan",action:"show",planId:e}}}async handleContextCommand(e,t,s){if(!this.workspaceId)return t.markdown("\u26A0\uFE0F Workspace not registered."),{metadata:{command:"context"}};let n=e.prompt.trim();if(n.toLowerCase().startsWith("set "))return await this.handleContextSetSubcommand(n.slice(4).trim(),t);t.markdown(`\u{1F50D} **Gathering workspace context...**

`),t.progress("Querying workspace info...");try{let r=await this.mcpBridge.callTool("memory_workspace",{action:"info",workspace_id:this.workspaceId});if(t.markdown(`## Workspace Information

`),t.markdown(`**ID**: \`${r.workspace_id}\`
`),t.markdown(`**Path**: \`${r.workspace_path}\`
`),r.codebase_profile){let i=r.codebase_profile;t.markdown(`
## Codebase Profile

`),i.languages&&i.languages.length>0&&t.markdown(`**Languages**: ${i.languages.join(", ")}
`),i.frameworks&&i.frameworks.length>0&&t.markdown(`**Frameworks**: ${i.frameworks.join(", ")}
`),i.file_count&&t.markdown(`**Files**: ${i.file_count}
`)}}catch{t.markdown(`\u26A0\uFE0F Could not retrieve full context. Basic workspace info:

`),t.markdown(`**Workspace ID**: \`${this.workspaceId}\`
`)}try{t.progress("Fetching workspace context...");let r=await this.mcpBridge.callTool("memory_context",{action:"workspace_get",workspace_id:this.workspaceId}),i=r?.sections;if(i&&Object.keys(i).length>0){let a={project_details:"Project Details",purpose:"Purpose",dependencies:"Dependencies",modules:"Modules",test_confirmations:"Test Confirmations",dev_patterns:"Dev Patterns",resources:"Resources"},c=l=>a[l]?a[l]:l.split("_").map(p=>p.charAt(0).toUpperCase()+p.slice(1)).join(" ");t.markdown(`
## Workspace Context

`),r.updated_at&&t.markdown(`*Last updated: ${new Date(r.updated_at).toLocaleString()}*

`);for(let[l,p]of Object.entries(i)){let d=p.items?.length??0,u=!!p.summary?.trim();!u&&d===0||(t.markdown(`### ${c(l)}

`),u&&t.markdown(`${p.summary}

`),d>0&&t.markdown(`*${d} item${d>1?"s":""}*

`))}}else t.markdown(`
*No workspace context sections configured yet.*
`)}catch{}try{t.progress("Fetching knowledge files...");let i=(await this.mcpBridge.callTool("memory_context",{action:"knowledge_list",workspace_id:this.workspaceId}))?.files??[];if(i.length>0){t.markdown(`
## Knowledge Files

`),t.markdown(`**${i.length}** file${i.length>1?"s":""} available:

`);for(let a of i)t.markdown(`- **${a.title}** (${a.category}) \u2014 \`${a.slug}\`
`);t.markdown("\nUse `/knowledge show {slug}` to view details.\n")}}catch{}return{metadata:{command:"context"}}}async handleContextSetSubcommand(e,t){if(!this.workspaceId)return t.markdown("\u26A0\uFE0F Workspace not registered."),{metadata:{command:"context",action:"set"}};let s=e.indexOf(" ");if(s===-1||!e.trim())return t.markdown("\u26A0\uFE0F Usage: `/context set {section_key} {content}`\n\n"),t.markdown("Example: `/context set project_details This is a TypeScript MCP server\u2026`\n\n"),t.markdown("**Available section keys**: `project_details`, `purpose`, `dependencies`, `modules`, `test_confirmations`, `dev_patterns`, `resources`, or any custom key.\n"),{metadata:{command:"context",action:"set"}};let n=e.slice(0,s).trim(),r=e.slice(s+1).trim();if(!r)return t.markdown(`\u26A0\uFE0F Please provide content after the section key.
`),{metadata:{command:"context",action:"set"}};t.progress(`Setting ${n}\u2026`);try{await this.mcpBridge.callTool("memory_context",{action:"workspace_update",workspace_id:this.workspaceId,type:n,data:{summary:r}});let i=a=>({project_details:"Project Details",purpose:"Purpose",dependencies:"Dependencies",modules:"Modules",test_confirmations:"Test Confirmations",dev_patterns:"Dev Patterns",resources:"Resources"})[a]??a.split("_").map(l=>l.charAt(0).toUpperCase()+l.slice(1)).join(" ");t.markdown(`\u2705 **${i(n)}** updated.

`),t.markdown(`> ${r.length>200?r.slice(0,200)+"\u2026":r}
`)}catch(i){let a=i instanceof Error?i.message:String(i);t.markdown(`\u26A0\uFE0F Failed to update context section: ${a}
`)}return{metadata:{command:"context",action:"set",sectionKey:n}}}async handleHandoffCommand(e,t,s){let n=e.prompt.trim();if(!n)return t.markdown(`\u{1F91D} **Handoff Command**

`),t.markdown("Usage: `/handoff <agent-type> <plan-id> [summary]`\n\n"),t.markdown(`**Available agents:**
`),t.markdown("- `Coordinator` - Orchestrates the workflow\n"),t.markdown("- `Researcher` - Gathers external information\n"),t.markdown("- `Architect` - Creates implementation plans\n"),t.markdown("- `Executor` - Implements the plan\n"),t.markdown("- `Reviewer` - Validates completed work\n"),t.markdown("- `Tester` - Writes and runs tests\n"),t.markdown("- `Archivist` - Finalizes and archives\n"),t.markdown("- `Analyst` - Deep investigation and analysis\n"),t.markdown("- `Brainstorm` - Explore and refine ideas\n"),t.markdown("- `Runner` - Quick tasks and exploration\n"),t.markdown("- `Builder` - Build verification and diagnostics\n"),{metadata:{command:"handoff"}};let r=n.split(" ");if(r.length<2)return t.markdown(`\u26A0\uFE0F Please provide both agent type and plan ID.
`),t.markdown("Example: `/handoff Executor plan_abc123`"),{metadata:{command:"handoff"}};let i=r[0],a=r[1],c=r.slice(2).join(" ")||"Handoff from chat";if(!this.workspaceId)return t.markdown("\u26A0\uFE0F Workspace not registered."),{metadata:{command:"handoff"}};t.markdown(`\u{1F504} Initiating handoff to **${i}**...

`);try{let l=await this.mcpBridge.callTool("memory_agent",{action:"handoff",workspace_id:this.workspaceId,plan_id:a,from_agent:"User",to_agent:i,summary:c});t.markdown(`\u2705 **Handoff recorded!**

`),t.markdown(`Plan \`${a}\` handoff to **${i}** has been recorded.
`),l?.warning&&t.markdown(`
\u26A0\uFE0F ${l.warning}
`)}catch(l){let p=l instanceof Error?l.message:String(l);t.markdown(`\u274C Handoff failed: ${p}`)}return{metadata:{command:"handoff",targetAgent:i,planId:a}}}async handleStatusCommand(e,t,s){if(!this.workspaceId)return t.markdown("\u26A0\uFE0F Workspace not registered."),{metadata:{command:"status"}};t.markdown(`\u{1F4CA} **Project Memory Status**

`),t.progress("Checking MCP connection...");let n=this.mcpBridge.isConnected();t.markdown(`**MCP Server**: ${n?"\u{1F7E2} Connected":"\u{1F534} Disconnected"}
`),t.markdown(`**Workspace ID**: \`${this.workspaceId}\`

`),t.progress("Fetching plans...");try{let a=((await this.mcpBridge.callTool("memory_plan",{action:"list",workspace_id:this.workspaceId})).active_plans||[]).filter(c=>c.status!=="archived");if(t.markdown(`## Active Plans (${a.length})

`),a.length===0)t.markdown(`No active plans.
`);else for(let c of a){let l=this.getStatusEmoji(c.status),p=c.done_steps??c.progress?.done??0,d=c.total_steps??c.progress?.total??0,u=c.plan_id||c.id;t.markdown(`${l} **${c.title}**${u?` (\`${u}\`)`:""}
`),d>0&&t.markdown(`   Progress: ${p}/${d} steps
`)}}catch{t.markdown(`Could not retrieve plan status.
`)}return{metadata:{command:"status"}}}async handleDeployCommand(e,t,s){let n=e.prompt.trim().toLowerCase();if(!n)return t.markdown(`\u{1F680} **Deploy Command**

`),t.markdown("Usage: `/deploy <target>`\n\n"),t.markdown(`**Targets:**
`),t.markdown("- `agents` \u2014 Copy agent files to the open workspace\n"),t.markdown("- `prompts` \u2014 Copy prompt files to the open workspace\n"),t.markdown("- `instructions` \u2014 Copy instruction files to the open workspace\n"),t.markdown("- `all` \u2014 Deploy agents, prompts, and instructions\n"),{metadata:{command:"deploy"}};let i={agents:"projectMemory.deployAgents",prompts:"projectMemory.deployPrompts",instructions:"projectMemory.deployInstructions",all:"projectMemory.deployCopilotConfig"}[n];if(!i)return t.markdown(`\u26A0\uFE0F Unknown deploy target: **${n}**

Use: agents, prompts, instructions, or all`),{metadata:{command:"deploy"}};t.markdown(`\u{1F680} Running **deploy ${n}**...
`);try{await Te.commands.executeCommand(i),t.markdown(`
\u2705 Deploy ${n} command executed.`)}catch(a){let c=a instanceof Error?a.message:String(a);t.markdown(`
\u274C Deploy failed: ${c}`)}return{metadata:{command:"deploy",target:n}}}async handleDiagnosticsCommand(e,t,s){t.markdown(`\u{1F50D} **Running diagnostics...**

`);try{if(await Te.commands.executeCommand("projectMemory.showDiagnostics"),t.markdown(`\u2705 Diagnostics report written to the **Project Memory Diagnostics** output channel.

`),this.mcpBridge.isConnected())try{let n=Date.now(),r=await this.mcpBridge.callTool("memory_workspace",{action:"list"}),i=Date.now()-n,a=Array.isArray(r.workspaces)?r.workspaces.length:0;t.markdown(`## Quick Summary

`),t.markdown(`| Metric | Value |
|--------|-------|
`),t.markdown(`| MCP Connection | \u{1F7E2} Connected |
`),t.markdown(`| MCP Response Time | ${i}ms |
`),t.markdown(`| Workspaces | ${a} |
`),t.markdown(`| Memory | ${(process.memoryUsage().heapUsed/1024/1024).toFixed(1)} MB |
`)}catch{t.markdown(`\u26A0\uFE0F Could not probe MCP server for summary.
`)}else t.markdown(`\u26A0\uFE0F MCP server is **not connected**. Some diagnostics may be incomplete.
`)}catch(n){let r=n instanceof Error?n.message:String(n);t.markdown(`\u274C Diagnostics failed: ${r}`)}return{metadata:{command:"diagnostics"}}}async handleDefaultCommand(e,t,s){let n=e.prompt.trim();if(!n)return t.markdown(`\u{1F44B} **Welcome to Project Memory!**

`),t.markdown(`I can help you manage project plans and agent workflows.

`),t.markdown(`**Available commands:**
`),t.markdown("- `/plan` - View, create, or manage plans\n"),t.markdown("- `/context` - Get workspace context and codebase profile\n"),t.markdown("- `/context set {key} {value}` - Set a context section\n"),t.markdown("- `/knowledge` - Manage workspace knowledge files\n"),t.markdown("- `/handoff` - Execute agent handoffs\n"),t.markdown("- `/status` - Show current plan progress\n"),t.markdown("- `/deploy` - Deploy agents, prompts, or instructions\n"),t.markdown("- `/diagnostics` - Run system health diagnostics\n"),t.markdown(`
Or just ask me about your project!`),{metadata:{command:"help"}};if(n.toLowerCase().includes("plan")||n.toLowerCase().includes("create"))t.markdown(`I can help you with plans!

`),t.markdown("Try using the `/plan` command:\n"),t.markdown("- `/plan list` to see existing plans\n"),t.markdown(`- \`/plan create ${n}\` to create a new plan
`);else{if(n.toLowerCase().includes("status")||n.toLowerCase().includes("progress"))return await this.handleStatusCommand(e,t,s);t.markdown(`I understand you want to: **${n}**

`),t.markdown(`Here's what I can help with:
`),t.markdown(`- Use \`/plan create ${n}\` to create a plan for this
`),t.markdown("- Use `/status` to check current progress\n"),t.markdown("- Use `/context` to get workspace information\n")}return{metadata:{command:"default"}}}provideFollowups(e,t,s){let n=e.metadata,r=n?.command,i=[];switch(r){case"plan":n?.action==="created"&&n?.planId&&i.push({prompt:`/plan show ${n.planId}`,label:"View plan details",command:"plan"}),i.push({prompt:"/status",label:"Check status",command:"status"});break;case"status":i.push({prompt:"/plan list",label:"List all plans",command:"plan"});break;case"help":case"default":i.push({prompt:"/plan list",label:"List plans",command:"plan"}),i.push({prompt:"/status",label:"Check status",command:"status"}),i.push({prompt:"/diagnostics",label:"Run diagnostics",command:"diagnostics"});break}return i}getStatusEmoji(e){switch(e){case"active":return"\u{1F535}";case"completed":return"\u2705";case"archived":return"\u{1F4E6}";case"blocked":return"\u{1F534}";default:return"\u26AA"}}getStepStatusEmoji(e){switch(e){case"done":return"\u2705";case"active":return"\u{1F504}";case"blocked":return"\u{1F534}";default:return"\u2B1C"}}resetWorkspace(){this.workspaceId=null}dispose(){this.participant.dispose()}};var Fe=P(require("vscode"));var $e=P(require("vscode"));async function Lo(o,e,t){try{if(!t.mcpBridge.isConnected())return wn("MCP server not connected");let{action:s,workspacePath:n,workspaceId:r}=o.input,i;switch(s){case"register":{let a=n??$e.workspace.workspaceFolders?.[0]?.uri.fsPath;if(!a)return wn("No workspace path provided and no workspace folder open");let c=await t.mcpBridge.callTool("memory_workspace",{action:"register",workspace_path:a});t.setWorkspaceId(c.workspace_id),i=c;break}case"list":i=await t.mcpBridge.callTool("memory_workspace",{action:"list"});break;case"info":{let a=r??await t.ensureWorkspace();i=await t.mcpBridge.callTool("memory_workspace",{action:"info",workspace_id:a});break}case"reindex":{let a=r??await t.ensureWorkspace();i=await t.mcpBridge.callTool("memory_workspace",{action:"reindex",workspace_id:a});break}default:return wn(`Unknown action: ${s}`)}return new $e.LanguageModelToolResult([new $e.LanguageModelTextPart(JSON.stringify(i,null,2))])}catch(s){return wn(s)}}function wn(o){let e=o instanceof Error?o.message:String(o);return new $e.LanguageModelToolResult([new $e.LanguageModelTextPart(JSON.stringify({success:!1,error:e}))])}var tt=P(require("vscode"));async function Bo(o,e,t){try{if(!t.mcpBridge.isConnected())return De("MCP server not connected");let s=await t.ensureWorkspace(),{action:n,planId:r,agentType:i,fromAgent:a,toAgent:c,reason:l,summary:p,artifacts:d,taskDescription:u}=o.input,h;switch(n){case"init":{if(!r||!i)return De("planId and agentType are required for init");h=await t.mcpBridge.callTool("memory_agent",{action:"init",workspace_id:s,plan_id:r,agent_type:i,task_description:u});break}case"complete":{if(!r||!i)return De("planId and agentType are required for complete");h=await t.mcpBridge.callTool("memory_agent",{action:"complete",workspace_id:s,plan_id:r,agent_type:i,summary:p,artifacts:d});break}case"handoff":{if(!r||!c)return De("planId and toAgent are required for handoff");h=await t.mcpBridge.callTool("memory_agent",{action:"handoff",workspace_id:s,plan_id:r,from_agent:a||"User",to_agent:c,reason:l||p||"Handoff via chat tool",summary:p,artifacts:d});break}case"validate":{if(!i)return De("agentType is required for validate");h=await t.mcpBridge.callTool("memory_agent",{action:"validate",workspace_id:s,plan_id:r,agent_type:i,task_description:u});break}case"list":{h=await t.mcpBridge.callTool("memory_agent",{action:"list",workspace_id:s,plan_id:r});break}case"get_instructions":{if(!i)return De("agentType is required for get_instructions");h=await t.mcpBridge.callTool("memory_agent",{action:"get_instructions",workspace_id:s,agent_type:i});break}default:return De(`Unknown action: ${n}`)}return new tt.LanguageModelToolResult([new tt.LanguageModelTextPart(JSON.stringify(h,null,2))])}catch(s){return De(s)}}function De(o){let e=o instanceof Error?o.message:String(o);return new tt.LanguageModelToolResult([new tt.LanguageModelTextPart(JSON.stringify({success:!1,error:e}))])}var nt=P(require("vscode"));async function Ho(o,e,t){try{if(!t.mcpBridge.isConnected())return me("MCP server not connected");let s=await t.ensureWorkspace(),n=o.input,r;switch(n.action){case"list":{let a=(await t.mcpBridge.callTool("memory_plan",{action:"list",workspace_id:s,include_archived:n.includeArchived})).active_plans||[];r={workspace_id:s,plans:a,total:a.length,message:a.length>0?`Found ${a.length} plan(s)`:'No plans found. Use action "create" to create one.'};break}case"get":{if(!n.planId)return me("planId is required for get");r=await t.mcpBridge.callTool("memory_plan",{action:"get",workspace_id:s,plan_id:n.planId});break}case"create":{if(!n.title||!n.description)return me("title and description are required for create");r=await t.mcpBridge.callTool("memory_plan",{action:"create",workspace_id:s,title:n.title,description:n.description,category:n.category||"feature",priority:n.priority||"medium",template:n.template,goals:n.goals,success_criteria:n.success_criteria});break}case"archive":{if(!n.planId)return me("planId is required for archive");r=await t.mcpBridge.callTool("memory_plan",{action:"archive",workspace_id:s,plan_id:n.planId});break}case"update":{if(!n.planId)return me("planId is required for update");r=await t.mcpBridge.callTool("memory_plan",{action:"update",workspace_id:s,plan_id:n.planId,steps:n.steps});break}case"find":{if(!n.planId)return me("planId is required for find");r=await t.mcpBridge.callTool("memory_plan",{action:"find",workspace_id:s,plan_id:n.planId});break}case"set_goals":{if(!n.planId)return me("planId is required for set_goals");r=await t.mcpBridge.callTool("memory_plan",{action:"set_goals",workspace_id:s,plan_id:n.planId,goals:n.goals,success_criteria:n.success_criteria});break}case"add_build_script":{if(!n.planId||!n.scriptName||!n.scriptCommand)return me("planId, scriptName, scriptCommand are required");r=await t.mcpBridge.callTool("memory_plan",{action:"add_build_script",workspace_id:s,plan_id:n.planId,script_name:n.scriptName,script_command:n.scriptCommand,script_description:n.scriptDescription,script_directory:n.scriptDirectory});break}case"delete_build_script":{if(!n.planId||!n.scriptId)return me("planId and scriptId are required");r=await t.mcpBridge.callTool("memory_plan",{action:"delete_build_script",workspace_id:s,plan_id:n.planId,script_id:n.scriptId});break}case"add_note":{if(!n.planId||!n.note)return me("planId and note are required for add_note");r=await t.mcpBridge.callTool("memory_plan",{action:"add_note",workspace_id:s,plan_id:n.planId,note:n.note,note_type:n.noteType||"info"});break}default:return me(`Unknown action: ${n.action}`)}return new nt.LanguageModelToolResult([new nt.LanguageModelTextPart(JSON.stringify(r,null,2))])}catch(s){return me(s)}}function me(o){let e=o instanceof Error?o.message:String(o);return new nt.LanguageModelToolResult([new nt.LanguageModelTextPart(JSON.stringify({success:!1,error:e}))])}var ot=P(require("vscode"));async function No(o,e,t){try{if(!t.mcpBridge.isConnected())return we("MCP server not connected");let s=await t.ensureWorkspace(),n=o.input;if(!n.planId)return we("planId is required");let r;switch(n.action){case"update":{if(n.stepIndex===void 0||!n.status)return we("stepIndex and status are required for update");r=await t.mcpBridge.callTool("memory_steps",{action:"update",workspace_id:s,plan_id:n.planId,step_index:n.stepIndex,status:n.status,notes:n.notes});break}case"batch_update":{if(!n.updates||n.updates.length===0)return we("updates array is required for batch_update");r=await t.mcpBridge.callTool("memory_steps",{action:"batch_update",workspace_id:s,plan_id:n.planId,updates:n.updates});break}case"add":{if(!n.newSteps||n.newSteps.length===0)return we("newSteps array is required for add");r=await t.mcpBridge.callTool("memory_steps",{action:"add",workspace_id:s,plan_id:n.planId,steps:n.newSteps.map(i=>({...i,status:i.status||"pending"}))});break}case"insert":{if(n.atIndex===void 0||!n.step)return we("atIndex and step are required for insert");r=await t.mcpBridge.callTool("memory_steps",{action:"insert",workspace_id:s,plan_id:n.planId,at_index:n.atIndex,step:{...n.step,status:n.step.status||"pending"}});break}case"delete":{if(n.stepIndex===void 0)return we("stepIndex is required for delete");r=await t.mcpBridge.callTool("memory_steps",{action:"delete",workspace_id:s,plan_id:n.planId,step_index:n.stepIndex});break}case"reorder":{if(n.stepIndex===void 0||!n.direction)return we("stepIndex and direction are required for reorder");r=await t.mcpBridge.callTool("memory_steps",{action:"reorder",workspace_id:s,plan_id:n.planId,step_index:n.stepIndex,direction:n.direction});break}case"move":{if(n.fromIndex===void 0||n.toIndex===void 0)return we("fromIndex and toIndex are required for move");r=await t.mcpBridge.callTool("memory_steps",{action:"move",workspace_id:s,plan_id:n.planId,from_index:n.fromIndex,to_index:n.toIndex});break}case"replace":{if(!n.replacementSteps)return we("replacementSteps array is required for replace");r=await t.mcpBridge.callTool("memory_steps",{action:"replace",workspace_id:s,plan_id:n.planId,replacement_steps:n.replacementSteps.map(i=>({...i,status:i.status||"pending"}))});break}default:return we(`Unknown action: ${n.action}`)}return new ot.LanguageModelToolResult([new ot.LanguageModelTextPart(JSON.stringify(r,null,2))])}catch(s){return we(s)}}function we(o){let e=o instanceof Error?o.message:String(o);return new ot.LanguageModelToolResult([new ot.LanguageModelTextPart(JSON.stringify({success:!1,error:e}))])}var st=P(require("vscode"));async function Oo(o,e,t){try{if(!t.mcpBridge.isConnected())return le("MCP server not connected");let s=await t.ensureWorkspace(),n=o.input,r;switch(n.action){case"add_note":{if(!n.planId||!n.note)return le("planId and note are required for add_note");r=await t.mcpBridge.callTool("memory_plan",{action:"add_note",workspace_id:s,plan_id:n.planId,note:n.note,note_type:n.noteType||"info"});break}case"briefing":{if(!n.planId)return le("planId is required for briefing");r=await t.mcpBridge.callTool("memory_agent",{action:"get_briefing",workspace_id:s,plan_id:n.planId});break}case"handoff":{if(!n.planId||!n.targetAgent||!n.reason)return le("planId, targetAgent, and reason are required for handoff");r=await t.mcpBridge.callTool("memory_agent",{action:"handoff",workspace_id:s,plan_id:n.planId,from_agent:"User",to_agent:n.targetAgent,reason:n.reason});break}case"workspace":{r=await t.mcpBridge.callTool("memory_workspace",{action:"info",workspace_id:s});break}case"store":{if(!n.planId||!n.type||!n.data)return le("planId, type, and data are required for store");r=await t.mcpBridge.callTool("memory_context",{action:"store",workspace_id:s,plan_id:n.planId,type:n.type,data:n.data});break}case"get":{if(!n.planId||!n.type)return le("planId and type are required for get");r=await t.mcpBridge.callTool("memory_context",{action:"get",workspace_id:s,plan_id:n.planId,type:n.type});break}case"store_initial":{if(!n.planId||!n.userRequest)return le("planId and userRequest are required for store_initial");r=await t.mcpBridge.callTool("memory_context",{action:"store_initial",workspace_id:s,plan_id:n.planId,user_request:n.userRequest,files_mentioned:n.filesMentioned,file_contents:n.fileContents,requirements:n.requirements,constraints:n.constraints,examples:n.examples,conversation_context:n.conversationContext,additional_notes:n.additionalNotes});break}case"list":{if(!n.planId)return le("planId is required for list");r=await t.mcpBridge.callTool("memory_context",{action:"list",workspace_id:s,plan_id:n.planId});break}case"list_research":{if(!n.planId)return le("planId is required for list_research");r=await t.mcpBridge.callTool("memory_context",{action:"list_research",workspace_id:s,plan_id:n.planId});break}case"append_research":{if(!n.planId||!n.filename||!n.content)return le("planId, filename, and content are required for append_research");r=await t.mcpBridge.callTool("memory_context",{action:"append_research",workspace_id:s,plan_id:n.planId,filename:n.filename,content:n.content});break}case"batch_store":{if(!n.planId||!n.items||n.items.length===0)return le("planId and items array are required for batch_store");r=await t.mcpBridge.callTool("memory_context",{action:"batch_store",workspace_id:s,plan_id:n.planId,items:n.items});break}case"workspace_get":case"workspace_set":case"workspace_update":case"workspace_delete":{if(!n.type)return le("type is required for workspace-scoped context");r=await t.mcpBridge.callTool("memory_context",{action:n.action,workspace_id:s,type:n.type,data:n.data});break}default:return le(`Unknown action: ${n.action}`)}return new st.LanguageModelToolResult([new st.LanguageModelTextPart(JSON.stringify(r,null,2))])}catch(s){return le(s)}}function le(o){let e=o instanceof Error?o.message:String(o);return new st.LanguageModelToolResult([new st.LanguageModelTextPart(JSON.stringify({success:!1,error:e}))])}var St=class{mcpBridge;workspaceId=null;disposables=[];ctx;constructor(e){this.mcpBridge=e,this.ctx={mcpBridge:this.mcpBridge,ensureWorkspace:()=>this.ensureWorkspace(),setWorkspaceId:t=>{this.workspaceId=t}},this.registerTools()}resetWorkspace(){this.workspaceId=null}registerTools(){this.disposables.push(Fe.lm.registerTool("memory_workspace",{invoke:(e,t)=>Lo(e,t,this.ctx)})),this.disposables.push(Fe.lm.registerTool("memory_agent",{invoke:(e,t)=>Bo(e,t,this.ctx)})),this.disposables.push(Fe.lm.registerTool("memory_plan",{invoke:(e,t)=>Ho(e,t,this.ctx)})),this.disposables.push(Fe.lm.registerTool("memory_steps",{invoke:(e,t)=>No(e,t,this.ctx)})),this.disposables.push(Fe.lm.registerTool("memory_context",{invoke:(e,t)=>Oo(e,t,this.ctx)}))}async ensureWorkspace(){if(this.workspaceId)return this.workspaceId;let e=Fe.workspace.workspaceFolders?.[0];if(!e)throw new Error("No workspace folder open");let t=await this.mcpBridge.callTool("memory_workspace",{action:"register",workspace_path:e.uri.fsPath});return this.workspaceId=t.workspace_id,this.workspaceId}dispose(){this.disposables.forEach(e=>e.dispose()),this.disposables=[]}};var li=P(require("vscode")),vn=class{constructor(e,t,s){this.serverManager=e;this.getMcpBridge=t;this.serverPort=s}extensionStartTime=Date.now();healthCheckTimer=null;lastReport=null;_onHealthChange=new li.EventEmitter;onHealthChange=this._onHealthChange.event;startMonitoring(e=3e4){this.healthCheckTimer||(this.healthCheckTimer=setInterval(()=>{this.runCheck()},e),this.runCheck())}stopMonitoring(){this.healthCheckTimer&&(clearInterval(this.healthCheckTimer),this.healthCheckTimer=null)}async runCheck(){let e=[],t=this.serverManager.isContainerMode,s=this.serverManager.isRunning||t,n=this.serverManager.isExternalServer,r=this.serverManager.isFrontendRunning||t;s||e.push("Dashboard server is not running");let i=this.getMcpBridge(),a=i?.isConnected()??!1,c=null,l=null;if(a&&i)try{let v=Date.now();await Promise.race([i.callTool("memory_workspace",{action:"list"}),new Promise((k,D)=>setTimeout(()=>D(new Error("MCP probe timeout (5s)")),5e3))]),c=Date.now()-v,c>3e3&&e.push(`MCP server slow: ${c}ms response time`)}catch(v){l=v instanceof Error?v.message:String(v),e.push(`MCP health probe failed: ${l}`)}a||e.push("MCP server is not connected");let p=process.memoryUsage(),d=Math.round(p.heapUsed/1024/1024*100)/100;d>500&&e.push(`High memory usage: ${d} MB`);let u=Math.floor((Date.now()-this.extensionStartTime)/1e3),h="green";e.length>0&&(h=e.some(v=>v.includes("not running")||v.includes("not connected"))?"red":"yellow");let w={timestamp:new Date().toISOString(),server:{running:s,external:n,containerMode:t,port:this.serverPort,frontendRunning:r},mcp:{connected:a,lastProbeMs:c,probeError:l},extension:{memoryMB:d,uptime:u},health:h,issues:e};return this.lastReport=w,this._onHealthChange.fire(w),w}async getReport(){return this.lastReport?this.lastReport:this.runCheck()}formatReport(e){let t=[];return t.push("=== Project Memory Diagnostics ==="),t.push(`Timestamp: ${e.timestamp}`),t.push(`Health: ${e.health.toUpperCase()}`),t.push(""),t.push("--- Dashboard Server ---"),t.push(`  Running: ${e.server.running}`),t.push(`  Mode: ${e.server.containerMode?"container":e.server.external?"external":"local"}`),t.push(`  Port: ${e.server.port}`),t.push(`  Frontend: ${e.server.frontendRunning}`),t.push(""),t.push("--- MCP Server ---"),t.push(`  Connected: ${e.mcp.connected}`),e.mcp.lastProbeMs!==null&&t.push(`  Last probe: ${e.mcp.lastProbeMs}ms`),e.mcp.probeError&&t.push(`  Probe error: ${e.mcp.probeError}`),t.push(""),t.push("--- Extension ---"),t.push(`  Memory: ${e.extension.memoryMB} MB`),t.push(`  Uptime: ${e.extension.uptime}s`),t.push(""),e.issues.length>0?(t.push("--- Issues ---"),e.issues.forEach(s=>t.push(`  \u26A0 ${s}`))):t.push("No issues detected."),t.join(`
`)}dispose(){this.stopMonitoring(),this._onHealthChange.dispose()}};var yn=P(require("vscode"));function F(o,...e){return yn.workspace.getConfiguration("projectMemory").get("showNotifications",!0)?yn.window.showInformationMessage(o,...e):Promise.resolve(void 0)}async function di(o,e){try{let t=ge(e),s=t?t.projectPath:e,n=await fetch(`http://localhost:${o}/api/workspaces/register`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({workspace_path:s})});if(!n.ok)return null;let i=(await n.json()).workspace;return i?.workspace_id||i?.id||null}catch{return null}}var _n=P(require("vscode")),pi=P(require("path"));function kn(o){let e=_n.workspace.workspaceFolders;if(e){let t=ge(e[0].uri.fsPath);return t?pi.join(t.projectPath,o):_n.Uri.joinPath(e[0].uri,o).fsPath}return""}function jo(){return kn("data")}function Le(){return kn("agents")}function Ue(){return kn("instructions")}function bn(){return kn("prompts")}var A=P(require("vscode"));var ve=P(require("vscode")),xn=class o{static currentPanel;_panel;_disposables=[];static viewType="projectMemory.dashboard";constructor(e,t,s){this._panel=e,this._update(s),this._panel.onDidDispose(()=>this.dispose(),null,this._disposables),this._panel.webview.onDidReceiveMessage(n=>{n.type==="alert"&&ve.window.showInformationMessage(n.text)},null,this._disposables)}static createOrShow(e,t){let s=ve.window.activeTextEditor?ve.window.activeTextEditor.viewColumn:void 0;if(o.currentPanel){o.currentPanel._panel.reveal(s),o.currentPanel._update(t);return}let n=ve.window.createWebviewPanel(o.viewType,"\u{1F9E0} PMD",s||ve.ViewColumn.One,{enableScripts:!0,retainContextWhenHidden:!0,localResourceRoots:[e]});o.currentPanel=new o(n,e,t)}static revive(e,t,s){o.currentPanel=new o(e,t,s)}_update(e){let t=this._panel.webview;this._panel.title="\u{1F9E0} PMD",this._panel.iconPath={light:ve.Uri.joinPath(ve.Uri.file(__dirname),"..","resources","icon.svg"),dark:ve.Uri.joinPath(ve.Uri.file(__dirname),"..","resources","icon.svg")},t.html=this._getHtmlForWebview(t,e)}_getHtmlForWebview(e,t){let s=Hl();return`<!DOCTYPE html>
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
    
    <script nonce="${s}">
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
</html>`}dispose(){for(o.currentPanel=void 0,this._panel.dispose();this._disposables.length;){let e=this._disposables.pop();e&&e.dispose()}}};function Hl(){let o="",e="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";for(let t=0;t<32;t++)o+=e.charAt(Math.floor(Math.random()*e.length));return o}function Wo(o,e,t,s){o.subscriptions.push(A.commands.registerCommand("projectMemory.showDashboard",()=>{A.commands.executeCommand("workbench.view.extension.projectMemory")}),A.commands.registerCommand("projectMemory.openDashboardPanel",async n=>{if(!e.isContainerMode){if(!e.isRunning){if(await A.window.showWarningMessage("Project Memory server is not running. Start it first?","Start Server","Cancel")!=="Start Server")return;if(!await A.window.withProgress({location:A.ProgressLocation.Notification,title:"Starting Project Memory server...",cancellable:!1},async()=>await e.start())){A.window.showErrorMessage("Failed to start server. Check logs for details."),e.showLogs();return}}if(!e.isFrontendRunning&&!await A.window.withProgress({location:A.ProgressLocation.Notification,title:"Starting dashboard frontend...",cancellable:!1},async()=>await e.startFrontend())){A.window.showErrorMessage("Failed to start dashboard frontend. Check server logs."),e.showLogs();return}}let r=n||He();xn.createOrShow(o.extensionUri,r)}),A.commands.registerCommand("projectMemory.toggleServer",async()=>{e.isRunning?(await e.stopFrontend(),await e.stop(),F("Project Memory server stopped")):await e.start()?F("Project Memory server started"):A.window.showErrorMessage("Failed to start Project Memory server")}),A.commands.registerCommand("projectMemory.startServer",async()=>{if(e.isRunning){F("Server is already running");return}await e.start()?F("Project Memory server started"):(A.window.showErrorMessage("Failed to start server. Check logs for details."),e.showLogs())}),A.commands.registerCommand("projectMemory.stopServer",async()=>{await e.stopFrontend(),await e.stop(),F("Project Memory server stopped")}),A.commands.registerCommand("projectMemory.restartServer",async()=>{F("Restarting Project Memory server..."),await e.stopFrontend(),await e.restart()?F("Project Memory server restarted"):A.window.showErrorMessage("Failed to restart server")}),A.commands.registerCommand("projectMemory.showServerLogs",()=>{e.showLogs()}),A.commands.registerCommand("projectMemory.forceStopExternalServer",async()=>{let r=A.workspace.getConfiguration("projectMemory").get("serverPort")||3001;if(await A.window.showWarningMessage(`Force stop the external server on port ${r}?`,{modal:!0},"Force Stop")!=="Force Stop")return;await e.forceStopExternalServer()?F("External server stopped"):(A.window.showErrorMessage("Failed to stop external server. Check logs for details."),e.showLogs())}),A.commands.registerCommand("projectMemory.isolateServer",async()=>{let n=A.workspace.getConfiguration("projectMemory"),r=n.get("serverPort")||3001,i=r!==3001;if(i)await n.update("serverPort",3001,A.ConfigurationTarget.Workspace),await e.stopFrontend(),await e.stop(),A.window.showInformationMessage("Switching to shared server on port 3001. Reloading window...","Reload").then(a=>{a==="Reload"&&A.commands.executeCommand("workbench.action.reloadWindow")});else{let a=A.workspace.workspaceFolders?.[0];if(!a){A.window.showErrorMessage("No workspace folder open");return}let c=require("crypto").createHash("md5").update(a.uri.fsPath.toLowerCase()).digest("hex"),l=3101+parseInt(c.substring(0,4),16)%99;await n.update("serverPort",l,A.ConfigurationTarget.Workspace),await e.stopFrontend(),await e.stop(),A.window.showInformationMessage(`Switching to isolated server on port ${l}. Reloading window...`,"Reload").then(p=>{p==="Reload"&&A.commands.executeCommand("workbench.action.reloadWindow")})}t?.postMessage({type:"isolateServerStatus",data:{isolated:!i,port:i?3001:r}})}),A.commands.registerCommand("projectMemory.refreshData",()=>{t.postMessage({type:"refresh"})}))}var R=P(require("vscode")),te=P(require("path")),ne=P(require("fs"));function Uo(o,e,t){o.subscriptions.push(R.commands.registerCommand("projectMemory.deployAgents",async()=>{let s=R.workspace.workspaceFolders;if(!s){R.window.showErrorMessage("No workspace folder open");return}let n=R.workspace.getConfiguration("projectMemory"),i=n.get("agentsRoot")||Le(),a=n.get("instructionsRoot")||Ue(),c=n.get("defaultAgents")||[],l=n.get("defaultInstructions")||[];if(!i){R.window.showErrorMessage("Agents root not configured. Set projectMemory.agentsRoot in settings.");return}let p=s[0].uri.fsPath;try{let d=ne.readdirSync(i).filter(x=>x.endsWith(".agent.md"));if(d.length===0){R.window.showWarningMessage("No agent files found in agents root");return}let u=d.map(x=>{let S=x.replace(".agent.md","");return{label:S,description:x,picked:c.length===0||c.includes(S)}}),h=await R.window.showQuickPick(u,{canPickMany:!0,placeHolder:"Select agents to deploy",title:"Deploy Agents"});if(!h||h.length===0)return;let w=te.join(p,".github","agents");ne.mkdirSync(w,{recursive:!0});let v=0;for(let x of h){let S=`${x.label}.agent.md`,V=te.join(i,S),W=te.join(w,S);ne.copyFileSync(V,W),v++}let k=0;if(a&&l.length>0){let x=te.join(p,".github","instructions");ne.mkdirSync(x,{recursive:!0});for(let S of l){let V=`${S}.instructions.md`,W=te.join(a,V),he=te.join(x,V);ne.existsSync(W)&&(ne.copyFileSync(W,he),k++)}}e.postMessage({type:"deploymentComplete",data:{type:"agents",count:v,instructionsCount:k,targetDir:w}});let D=k>0?`Deployed ${v} agent(s) and ${k} instruction(s)`:`Deployed ${v} agent(s)`;F(D,"Open Folder").then(x=>{x==="Open Folder"&&R.commands.executeCommand("revealInExplorer",R.Uri.file(w))})}catch(d){R.window.showErrorMessage(`Failed to deploy agents: ${d}`)}}),R.commands.registerCommand("projectMemory.deployPrompts",async()=>{let s=R.workspace.workspaceFolders;if(!s){R.window.showErrorMessage("No workspace folder open");return}let n=R.workspace.getConfiguration("projectMemory"),r=n.get("promptsRoot")||bn(),i=n.get("defaultPrompts")||[];if(!r){R.window.showErrorMessage("Prompts root not configured. Set projectMemory.promptsRoot in settings.");return}let a=s[0].uri.fsPath;try{let c=ne.readdirSync(r).filter(h=>h.endsWith(".prompt.md"));if(c.length===0){R.window.showWarningMessage("No prompt files found in prompts root");return}let l=c.map(h=>{let w=h.replace(".prompt.md","");return{label:w,description:h,picked:i.length===0||i.includes(w)}}),p=await R.window.showQuickPick(l,{canPickMany:!0,placeHolder:"Select prompts to deploy",title:"Deploy Prompts"});if(!p||p.length===0)return;let d=te.join(a,".github","prompts");ne.mkdirSync(d,{recursive:!0});let u=0;for(let h of p){let w=`${h.label}.prompt.md`,v=te.join(r,w),k=te.join(d,w);ne.copyFileSync(v,k),u++}e.postMessage({type:"deploymentComplete",data:{type:"prompts",count:u,targetDir:d}}),F(`Deployed ${u} prompt(s) to ${te.relative(a,d)}`,"Open Folder").then(h=>{h==="Open Folder"&&R.commands.executeCommand("revealInExplorer",R.Uri.file(d))})}catch(c){R.window.showErrorMessage(`Failed to deploy prompts: ${c}`)}}),R.commands.registerCommand("projectMemory.deployInstructions",async()=>{let s=R.workspace.workspaceFolders;if(!s){R.window.showErrorMessage("No workspace folder open");return}let n=R.workspace.getConfiguration("projectMemory"),r=n.get("instructionsRoot")||Ue(),i=n.get("defaultInstructions")||[];if(!r){R.window.showErrorMessage("Instructions root not configured. Set projectMemory.instructionsRoot in settings.");return}let a=s[0].uri.fsPath;try{let c=ne.readdirSync(r).filter(h=>h.endsWith(".instructions.md"));if(c.length===0){R.window.showWarningMessage("No instruction files found in instructions root");return}let l=c.map(h=>{let w=h.replace(".instructions.md","");return{label:w,description:h,picked:i.length===0||i.includes(w)}}),p=await R.window.showQuickPick(l,{canPickMany:!0,placeHolder:"Select instructions to deploy",title:"Deploy Instructions"});if(!p||p.length===0)return;let d=te.join(a,".github","instructions");ne.mkdirSync(d,{recursive:!0});let u=0;for(let h of p){let w=`${h.label}.instructions.md`,v=te.join(r,w),k=te.join(d,w);ne.copyFileSync(v,k),u++}e.postMessage({type:"deploymentComplete",data:{type:"instructions",count:u,targetDir:d}}),F(`Deployed ${u} instruction(s) to ${te.relative(a,d)}`,"Open Folder").then(h=>{h==="Open Folder"&&R.commands.executeCommand("revealInExplorer",R.Uri.file(d))})}catch(c){R.window.showErrorMessage(`Failed to deploy instructions: ${c}`)}}),R.commands.registerCommand("projectMemory.deployCopilotConfig",async()=>{let s=R.workspace.workspaceFolders;if(!s){R.window.showErrorMessage("No workspace folder open");return}await R.window.showQuickPick(["Yes","No"],{placeHolder:"Deploy all Copilot config (agents, prompts, instructions)?"})==="Yes"&&(e.postMessage({type:"deployAllCopilotConfig",data:{workspacePath:s[0].uri.fsPath}}),F("Deploying all Copilot configuration..."))}),R.commands.registerCommand("projectMemory.deployDefaults",async()=>{let s=R.workspace.workspaceFolders;if(!s){R.window.showErrorMessage("No workspace folder open");return}let n=t.getDeploymentPlan();if(await R.window.showQuickPick(["Yes","No"],{placeHolder:`Deploy ${n.agents.length} agents and ${n.instructions.length} instructions?`})==="Yes"){let i=await t.deployToWorkspace(s[0].uri.fsPath);F(`Deployed ${i.agents.length} agents and ${i.instructions.length} instructions`)}}),R.commands.registerCommand("projectMemory.updateDefaults",async()=>{let s=R.workspace.workspaceFolders;if(!s){R.window.showErrorMessage("No workspace folder open");return}let n=await t.updateWorkspace(s[0].uri.fsPath);n.updated.length>0||n.added.length>0?F(`Updated ${n.updated.length} files, added ${n.added.length} new files`):F("All files are up to date")}))}var L=P(require("vscode")),ui=P(require("path"));function qo(o,e,t){o.subscriptions.push(L.commands.registerCommand("projectMemory.createPlan",async()=>{let s=L.workspace.workspaceFolders;if(!s){L.window.showErrorMessage("No workspace folder open");return}let n=t(),r=await L.window.showQuickPick([{label:"\u{1F9E0} Brainstorm First",description:"Explore ideas with an AI agent before creating a formal plan",value:"brainstorm"},{label:"\u{1F4DD} Create Plan Directly",description:"Create a formal plan with title, description, and category",value:"create"}],{placeHolder:"How would you like to start?"});if(!r)return;if(r.value==="brainstorm"){let x=await L.window.showInputBox({prompt:"What would you like to brainstorm?",placeHolder:"Describe the feature, problem, or idea you want to explore...",validateInput:S=>S.trim()?null:"Please enter a description"});if(!x)return;try{await L.commands.executeCommand("workbench.action.chat.open",{query:`@brainstorm ${x}`})}catch{await L.window.showInformationMessage("Open GitHub Copilot Chat and use @brainstorm agent with your prompt.","Copy Prompt")==="Copy Prompt"&&(await L.env.clipboard.writeText(`@brainstorm ${x}`),F("Prompt copied to clipboard"))}return}let i=await L.window.showInputBox({prompt:"Enter plan title",placeHolder:"My new feature...",validateInput:x=>x.trim()?null:"Title is required"});if(!i)return;let a=await L.window.showInputBox({prompt:"Enter plan description",placeHolder:"Describe what this plan will accomplish, the goals, and any context...",validateInput:x=>x.trim().length>=10?null:"Please provide at least a brief description (10+ characters)"});if(!a)return;let c=x=>x?x.split(/[,\n]+/).map(S=>S.trim()).filter(S=>S.length>0):[],l=[];try{let x=await fetch(`http://localhost:${n}/api/plans/templates`);if(x.ok){let S=await x.json();l=Array.isArray(S.templates)?S.templates:[]}}catch{}l.length===0&&(l=[{template:"feature",label:"Feature",category:"feature"},{template:"bugfix",label:"Bug Fix",category:"bug"},{template:"refactor",label:"Refactor",category:"refactor"},{template:"documentation",label:"Documentation",category:"documentation"},{template:"analysis",label:"Analysis",category:"analysis"},{template:"investigation",label:"Investigation",category:"investigation"}]);let p=await L.window.showQuickPick([{label:"Custom",description:"Choose category and define your own steps",value:"custom"},...l.map(x=>({label:x.label||x.template,description:x.category||x.template,value:x.template}))],{placeHolder:"Select a plan template (optional)"});if(!p)return;let d=p.value!=="custom"?p.value:null,u=null,h=[],w=[];if(!d){let x=await L.window.showQuickPick([{label:"\u2728 Feature",description:"New functionality or capability",value:"feature"},{label:"\u{1F41B} Bug",description:"Fix for an existing issue",value:"bug"},{label:"\u{1F504} Change",description:"Modification to existing behavior",value:"change"},{label:"\u{1F50D} Analysis",description:"Investigation or research task",value:"analysis"},{label:"\u{1F9EA} Investigation",description:"Deep-dive analysis with findings",value:"investigation"},{label:"\u{1F41E} Debug",description:"Debugging session for an issue",value:"debug"},{label:"\u267B\uFE0F Refactor",description:"Code improvement without behavior change",value:"refactor"},{label:"\u{1F4DA} Documentation",description:"Documentation updates",value:"documentation"}],{placeHolder:"Select plan category"});if(!x)return;u=x.value}let v=await L.window.showQuickPick([{label:"\u{1F534} Critical",description:"Urgent - needs immediate attention",value:"critical"},{label:"\u{1F7E0} High",description:"Important - should be done soon",value:"high"},{label:"\u{1F7E1} Medium",description:"Normal priority",value:"medium"},{label:"\u{1F7E2} Low",description:"Nice to have - when time permits",value:"low"}],{placeHolder:"Select priority level"});if(!v)return;if(!d&&u==="investigation"){let x=await L.window.showInputBox({prompt:"Enter investigation goals (comma-separated)",placeHolder:"Identify root cause, confirm scope"});h=c(x);let S=await L.window.showInputBox({prompt:"Enter success criteria (comma-separated)",placeHolder:"Root cause identified, resolution path defined"});if(w=c(S),h.length===0||w.length===0){L.window.showErrorMessage("Investigation plans require at least 1 goal and 1 success criteria.");return}}let k=s[0].uri.fsPath,D=await di(n,k);if(!D){L.window.showErrorMessage("Failed to register workspace with the dashboard server.");return}try{let x={title:i,description:a,priority:v.value,goals:h.length>0?h:void 0,success_criteria:w.length>0?w:void 0},S=d?await fetch(`http://localhost:${n}/api/plans/${D}/template`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...x,template:d})}):await fetch(`http://localhost:${n}/api/plans/${D}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...x,category:u})});if(S.ok){let V=await S.json(),W=V.plan_id||V.plan?.id||V.plan?.plan_id||V.planId;F(`Plan created: ${i}`,"Open Dashboard").then(he=>{he==="Open Dashboard"&&W&&L.commands.executeCommand("projectMemory.openDashboardPanel",`${He()}/workspace/${D}/plan/${W}`)})}else{let V=await S.text();L.window.showErrorMessage(`Failed to create plan: ${V}`)}}catch(x){L.window.showErrorMessage(`Failed to create plan: ${x}`)}}),L.commands.registerCommand("projectMemory.addToPlan",async s=>{let n,r,i;if(s)n=s.fsPath;else{let p=L.window.activeTextEditor;if(p){n=p.document.uri.fsPath;let d=p.selection;d.isEmpty||(r=p.document.getText(d),i=d.start.line+1)}}if(!n){L.window.showErrorMessage("No file selected");return}if(!L.workspace.workspaceFolders){L.window.showErrorMessage("No workspace folder open");return}let c=await L.window.showInputBox({prompt:"Describe the step/task for this file",placeHolder:"e.g., Review and update authentication logic",value:r?`Review: ${r.substring(0,50)}...`:`Work on ${ui.basename(n)}`});if(!c)return;let l=await L.window.showQuickPick(["investigation","research","analysis","planning","implementation","testing","validation","review","documentation","refactor","bugfix","handoff"],{placeHolder:"Select the phase for this step"});l&&(e.postMessage({type:"addStepToPlan",data:{task:c,phase:l,file:n,line:i,notes:r?`Selected code:
\`\`\`
${r.substring(0,500)}
\`\`\``:void 0}}),F(`Added step to plan: "${c}"`))}))}var C=P(require("vscode")),Rt=P(require("path")),rt=P(require("fs"));function Go(o,e,t,s){o.subscriptions.push(C.commands.registerCommand("projectMemory.migrateWorkspace",async()=>{let n=await C.window.showOpenDialog({canSelectFiles:!1,canSelectFolders:!0,canSelectMany:!1,openLabel:"Select Workspace to Migrate",title:"Select a workspace directory to migrate to the new identity system"});if(!n||n.length===0)return;let r=n[0].fsPath,i=s();if(!i){C.window.showErrorMessage("MCP Bridge not initialized. Please wait for the extension to fully load.");return}if(!i.isConnected())try{await i.connect()}catch{C.window.showErrorMessage("Failed to connect to MCP server. Please check the server is configured correctly.");return}await C.window.withProgress({location:C.ProgressLocation.Notification,title:"Migrating workspace...",cancellable:!1},async a=>{try{a.report({message:"Stopping dashboard server..."});let c=e.isRunning;c&&(await e.stopFrontend(),await e.stop()),await new Promise(w=>setTimeout(w,500)),a.report({message:"Running migration..."});let l=await i.callTool("memory_workspace",{action:"migrate",workspace_path:r});c&&(a.report({message:"Restarting dashboard server..."}),await e.start());let p=l.ghost_folders_found?.length||0,d=l.ghost_folders_merged?.length||0,u=l.plans_recovered?.length||0,h=`Migration complete for ${Rt.basename(r)}.
`;h+=`Workspace ID: ${l.workspace_id}
`,p>0&&(h+=`Found ${p} ghost folders, merged ${d}.
`),u>0&&(h+=`Recovered ${u} plans.
`),l.notes&&l.notes.length>0&&(h+=`Notes: ${l.notes.slice(0,3).join("; ")}`),C.window.showInformationMessage(h,{modal:!0})}catch(c){e.isRunning||await e.start(),C.window.showErrorMessage(`Migration failed: ${c.message}`)}})}),C.commands.registerCommand("projectMemory.openSettings",async()=>{let n=C.workspace.getConfiguration("projectMemory"),r=n.get("agentsRoot")||Le(),i=n.get("instructionsRoot")||Ue(),a=n.get("promptsRoot")||bn(),c=await C.window.showQuickPick([{label:"$(person) Configure Default Agents",description:"Select which agents to deploy by default",value:"agents"},{label:"$(book) Configure Default Instructions",description:"Select which instructions to deploy by default",value:"instructions"},{label:"$(file) Configure Default Prompts",description:"Select which prompts to deploy by default",value:"prompts"},{label:"$(gear) Open All Settings",description:"Open VS Code settings for Project Memory",value:"settings"}],{placeHolder:"What would you like to configure?"});if(c){if(c.value==="settings"){C.commands.executeCommand("workbench.action.openSettings","@ext:project-memory.project-memory-dashboard");return}if(c.value==="agents"&&r)try{let l=rt.readdirSync(r).filter(h=>h.endsWith(".agent.md")).map(h=>h.replace(".agent.md","")),p=n.get("defaultAgents")||[],d=l.map(h=>({label:h,picked:p.length===0||p.includes(h)})),u=await C.window.showQuickPick(d,{canPickMany:!0,placeHolder:"Select default agents (these will be pre-selected when deploying)",title:"Configure Default Agents"});u&&(await n.update("defaultAgents",u.map(h=>h.label),C.ConfigurationTarget.Global),F(`Updated default agents (${u.length} selected)`))}catch(l){C.window.showErrorMessage(`Failed to read agents: ${l}`)}if(c.value==="instructions"&&i)try{let l=rt.readdirSync(i).filter(h=>h.endsWith(".instructions.md")).map(h=>h.replace(".instructions.md","")),p=n.get("defaultInstructions")||[],d=l.map(h=>({label:h,picked:p.length===0||p.includes(h)})),u=await C.window.showQuickPick(d,{canPickMany:!0,placeHolder:"Select default instructions (these will be pre-selected when deploying)",title:"Configure Default Instructions"});u&&(await n.update("defaultInstructions",u.map(h=>h.label),C.ConfigurationTarget.Global),F(`Updated default instructions (${u.length} selected)`))}catch(l){C.window.showErrorMessage(`Failed to read instructions: ${l}`)}if(c.value==="prompts"&&a)try{let l=rt.readdirSync(a).filter(h=>h.endsWith(".prompt.md")).map(h=>h.replace(".prompt.md","")),p=n.get("defaultPrompts")||[],d=l.map(h=>({label:h,picked:p.length===0||p.includes(h)})),u=await C.window.showQuickPick(d,{canPickMany:!0,placeHolder:"Select default prompts (these will be pre-selected when deploying)",title:"Configure Default Prompts"});u&&(await n.update("defaultPrompts",u.map(h=>h.label),C.ConfigurationTarget.Global),F(`Updated default prompts (${u.length} selected)`))}catch(l){C.window.showErrorMessage(`Failed to read prompts: ${l}`)}}}),C.commands.registerCommand("projectMemory.openAgentFile",async()=>{let r=C.workspace.getConfiguration("projectMemory").get("agentsRoot")||Le();if(!r){C.window.showErrorMessage("Agents root not configured");return}try{let i=rt.readdirSync(r).filter(c=>c.endsWith(".agent.md")),a=await C.window.showQuickPick(i,{placeHolder:"Select an agent file to open"});if(a){let c=Rt.join(r,a),l=await C.workspace.openTextDocument(c);await C.window.showTextDocument(l)}}catch(i){C.window.showErrorMessage(`Failed to list agent files: ${i}`)}}),C.commands.registerCommand("projectMemory.openPromptFile",async()=>{let r=C.workspace.getConfiguration("projectMemory").get("promptsRoot");if(!r){C.window.showErrorMessage("Prompts root not configured. Set projectMemory.promptsRoot in settings.");return}try{let i=rt.readdirSync(r).filter(c=>c.endsWith(".prompt.md")),a=await C.window.showQuickPick(i,{placeHolder:"Select a prompt file to open"});if(a){let c=Rt.join(r,a),l=await C.workspace.openTextDocument(c);await C.window.showTextDocument(l)}}catch(i){C.window.showErrorMessage(`Failed to list prompt files: ${i}`)}}),C.commands.registerCommand("projectMemory.showCopilotStatus",()=>{t.postMessage({type:"showCopilotStatus"}),C.commands.executeCommand("workbench.view.extension.projectMemory")}),C.commands.registerCommand("projectMemory.openFile",async(n,r)=>{try{let i=await C.workspace.openTextDocument(n),a=await C.window.showTextDocument(i);if(r!==void 0){let c=new C.Position(r-1,0);a.selection=new C.Selection(c,c),a.revealRange(new C.Range(c,c),C.TextEditorRevealType.InCenter)}}catch{C.window.showErrorMessage(`Failed to open file: ${n}`)}}))}var xe,Et,ct,zo,J,Vo,it,ae=null,qe=null,Ge=null,at=null;function Nl(o){console.log("Project Memory Dashboard extension activating...");let e=q.workspace.getConfiguration("projectMemory"),t=e.get("dataRoot")||jo(),s=e.get("agentsRoot")||Le(),n=e.get("promptsRoot"),r=e.get("instructionsRoot"),i=e.get("serverPort")||3001,a=e.get("wsPort")||3002,c=e.get("autoStartServer")??!0,l=e.get("defaultAgents")||[],p=e.get("defaultInstructions")||[],d=e.get("autoDeployOnWorkspaceOpen")??!1;Vo=new fn({agentsRoot:s,instructionsRoot:r||Ue(),defaultAgents:l,defaultInstructions:p}),J=new gn({dataRoot:t,agentsRoot:s,promptsRoot:n,instructionsRoot:r,serverPort:i,wsPort:a}),o.subscriptions.push(J),xe=new Ft(o.extensionUri,t,s),xe.onFirstResolve(()=>{Ko()}),zo=new rn,o.subscriptions.push(zo),o.subscriptions.push(q.window.registerWebviewViewProvider("projectMemory.dashboardView",xe,{webviewOptions:{retainContextWhenHidden:!0}}));let u=()=>e.get("serverPort")||3001;Wo(o,J,xe,u),Uo(o,xe,Vo),qo(o,xe,u),Go(o,J,xe,()=>ae),it=new vn(J,()=>ae,i),o.subscriptions.push(it),it.startMonitoring(6e4);let h=q.window.createStatusBarItem(q.StatusBarAlignment.Right,99);if(h.command="projectMemory.showDiagnostics",h.text="$(pulse) PM",h.tooltip="Project Memory: Click for diagnostics",h.show(),o.subscriptions.push(h),it.onHealthChange(v=>{let k={green:"$(check)",yellow:"$(warning)",red:"$(error)"};h.text=`${k[v.health]} PM`,h.tooltip=v.issues.length>0?`Project Memory: ${v.issues.join("; ")}`:"Project Memory: All systems healthy"}),o.subscriptions.push(q.commands.registerCommand("projectMemory.showDiagnostics",async()=>{let v=await it.runCheck(),k=q.window.createOutputChannel("Project Memory Diagnostics");k.clear(),k.appendLine(it.formatReport(v)),k.show()})),d&&q.workspace.workspaceFolders?.[0]){let v=q.workspace.workspaceFolders[0].uri.fsPath;Vo.deployToWorkspace(v).then(k=>{(k.agents.length>0||k.instructions.length>0)&&F(`Deployed ${k.agents.length} agents and ${k.instructions.length} instructions`)})}c&&J.hasServerDirectory()&&Ko();let w=e.get("idleServerTimeoutMinutes")||0;w>0&&J.startIdleMonitoring(w),jl(o,e,t),setTimeout(()=>{Wl(o,e,s,n,r)},2e3),o.subscriptions.push(q.workspace.onDidChangeConfiguration(v=>{if(v.affectsConfiguration("projectMemory")){let k=q.workspace.getConfiguration("projectMemory");xe.updateConfig(k.get("dataRoot")||jo(),k.get("agentsRoot")||Le())}})),console.log("Project Memory Dashboard extension activated")}async function Ol(){if(console.log("Project Memory Dashboard extension deactivating..."),ae){try{await ae.disconnect(),ae.dispose()}catch(o){console.error("Error disconnecting MCP bridge:",o)}ae=null}if(qe&&(qe.dispose(),qe=null),Ge&&(Ge.dispose(),Ge=null),xe&&xe.dispose(),Et&&Et.stop(),ct&&ct.stop(),J)try{await Promise.race([(async()=>{await J.stopFrontend(),await J.stop(),await J.forceStopOwnedServer()})(),new Promise(o=>setTimeout(o,5e3))])}catch(o){console.error("Error stopping servers during deactivation:",o);try{await J.forceStopOwnedServer()}catch{}}console.log("Project Memory Dashboard extension deactivated")}async function Ko(){return J?J.isRunning?!0:J.hasServerDirectory()?at||(at=J.start().then(o=>(at=null,o?J.isExternalServer?F("Connected to existing Project Memory server"):F("Project Memory API server started"):q.window.showWarningMessage("Failed to start Project Memory server. Click to view logs.","View Logs").then(e=>{e==="View Logs"&&J.showLogs()}),o)).catch(o=>(at=null,console.error("Server start failed:",o),!1)),at):!1:!1}function jl(o,e,t){let s=e.get("chat.serverMode")||"bundled",n=e.get("chat.podmanImage")||"project-memory-mcp:latest",r=e.get("chat.externalServerPath")||"",i=e.get("chat.autoConnect")??!0;ae=new Ct({serverMode:s,podmanImage:n,externalServerPath:r,dataRoot:t}),o.subscriptions.push(ae),ae.onConnectionChange(a=>{a&&(qe?.resetWorkspace(),Ge?.resetWorkspace())}),qe=new Pt(ae),o.subscriptions.push(qe),Ge=new St(ae),o.subscriptions.push(Ge),o.subscriptions.push(q.commands.registerCommand("projectMemory.chat.reconnect",async()=>{if(!ae){q.window.showErrorMessage("MCP Bridge not initialized");return}try{await q.window.withProgress({location:q.ProgressLocation.Notification,title:"Reconnecting to MCP server...",cancellable:!1},async()=>{await ae.reconnect()}),F("Connected to MCP server")}catch(a){let c=a instanceof Error?a.message:String(a);q.window.showErrorMessage(`Failed to connect: ${c}`),ae.showLogs()}})),i&&ae.connect().then(()=>{console.log("MCP Bridge connected")}).catch(a=>{console.warn("MCP Bridge auto-connect failed:",a)}),o.subscriptions.push(q.workspace.onDidChangeConfiguration(a=>{a.affectsConfiguration("projectMemory.chat")&&F("Chat configuration changed. Some changes may require reconnecting.","Reconnect").then(c=>{c==="Reconnect"&&q.commands.executeCommand("projectMemory.chat.reconnect")})})),o.subscriptions.push(q.workspace.onDidChangeWorkspaceFolders(()=>{qe?.resetWorkspace(),Ge?.resetWorkspace()})),console.log("Chat integration initialized")}function Wl(o,e,t,s,n){t&&(Et=new nn(t,e.get("autoDeployAgents")||!1),Et.start(),o.subscriptions.push({dispose:()=>Et.stop()})),ct=new on({agentsRoot:t,promptsRoot:s,instructionsRoot:n,autoDeploy:e.get("autoDeployAgents")||!1}),ct.start(),ct.onFileChanged((r,i,a)=>{a==="change"&&zo.showTemporaryMessage(`${r} updated`)}),o.subscriptions.push({dispose:()=>ct.stop()})}0&&(module.exports={activate,deactivate,ensureServerRunning});
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
