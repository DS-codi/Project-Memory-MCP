"use strict";var Kr=Object.create;var rt=Object.defineProperty;var Yr=Object.getOwnPropertyDescriptor;var Qr=Object.getOwnPropertyNames;var Xr=Object.getPrototypeOf,Zr=Object.prototype.hasOwnProperty;var L=(s,e)=>()=>(e||s((e={exports:{}}).exports,e),e.exports),Jr=(s,e)=>{for(var t in e)rt(s,t,{get:e[t],enumerable:!0})},Bs=(s,e,t,n)=>{if(e&&typeof e=="object"||typeof e=="function")for(let r of Qr(e))!Zr.call(s,r)&&r!==t&&rt(s,r,{get:()=>e[r],enumerable:!(n=Yr(e,r))||n.enumerable});return s};var z=(s,e,t)=>(t=s!=null?Kr(Xr(s)):{},Bs(e||!s||!s.__esModule?rt(t,"default",{value:s,enumerable:!0}):t,s)),eo=s=>Bs(rt({},"__esModule",{value:!0}),s);var He=L((_c,Vs)=>{"use strict";var so=require("path"),ge="\\\\/",Us=`[^${ge}]`,we="\\.",no="\\+",ro="\\?",at="\\/",oo="(?=.)",qs="[^/]",Nt=`(?:${at}|$)`,Gs=`(?:^|${at})`,Ot=`${we}{1,2}${Nt}`,io=`(?!${we})`,ao=`(?!${Gs}${Ot})`,co=`(?!${we}{0,1}${Nt})`,lo=`(?!${Ot})`,uo=`[^.${at}]`,po=`${qs}*?`,zs={DOT_LITERAL:we,PLUS_LITERAL:no,QMARK_LITERAL:ro,SLASH_LITERAL:at,ONE_CHAR:oo,QMARK:qs,END_ANCHOR:Nt,DOTS_SLASH:Ot,NO_DOT:io,NO_DOTS:ao,NO_DOT_SLASH:co,NO_DOTS_SLASH:lo,QMARK_NO_DOT:uo,STAR:po,START_ANCHOR:Gs},ho={...zs,SLASH_LITERAL:`[${ge}]`,QMARK:Us,STAR:`${Us}*?`,DOTS_SLASH:`${we}{1,2}(?:[${ge}]|$)`,NO_DOT:`(?!${we})`,NO_DOTS:`(?!(?:^|[${ge}])${we}{1,2}(?:[${ge}]|$))`,NO_DOT_SLASH:`(?!${we}{0,1}(?:[${ge}]|$))`,NO_DOTS_SLASH:`(?!${we}{1,2}(?:[${ge}]|$))`,QMARK_NO_DOT:`[^.${ge}]`,START_ANCHOR:`(?:^|[${ge}])`,END_ANCHOR:`(?:[${ge}]|$)`},fo={alnum:"a-zA-Z0-9",alpha:"a-zA-Z",ascii:"\\x00-\\x7F",blank:" \\t",cntrl:"\\x00-\\x1F\\x7F",digit:"0-9",graph:"\\x21-\\x7E",lower:"a-z",print:"\\x20-\\x7E ",punct:"\\-!\"#$%&'()\\*+,./:;<=>?@[\\]^_`{|}~",space:" \\t\\r\\n\\v\\f",upper:"A-Z",word:"A-Za-z0-9_",xdigit:"A-Fa-f0-9"};Vs.exports={MAX_LENGTH:1024*64,POSIX_REGEX_SOURCE:fo,REGEX_BACKSLASH:/\\(?![*+?^${}(|)[\]])/g,REGEX_NON_SPECIAL_CHARS:/^[^@![\].,$*+?^{}()|\\/]+/,REGEX_SPECIAL_CHARS:/[-*+?.^${}(|)[\]]/,REGEX_SPECIAL_CHARS_BACKREF:/(\\?)((\W)(\3*))/g,REGEX_SPECIAL_CHARS_GLOBAL:/([-*+?.^${}(|)[\]])/g,REGEX_REMOVE_BACKSLASH:/(?:\[.*?[^\\]\]|\\(?=.))/g,REPLACEMENTS:{"***":"*","**/**":"**","**/**/**":"**"},CHAR_0:48,CHAR_9:57,CHAR_UPPERCASE_A:65,CHAR_LOWERCASE_A:97,CHAR_UPPERCASE_Z:90,CHAR_LOWERCASE_Z:122,CHAR_LEFT_PARENTHESES:40,CHAR_RIGHT_PARENTHESES:41,CHAR_ASTERISK:42,CHAR_AMPERSAND:38,CHAR_AT:64,CHAR_BACKWARD_SLASH:92,CHAR_CARRIAGE_RETURN:13,CHAR_CIRCUMFLEX_ACCENT:94,CHAR_COLON:58,CHAR_COMMA:44,CHAR_DOT:46,CHAR_DOUBLE_QUOTE:34,CHAR_EQUAL:61,CHAR_EXCLAMATION_MARK:33,CHAR_FORM_FEED:12,CHAR_FORWARD_SLASH:47,CHAR_GRAVE_ACCENT:96,CHAR_HASH:35,CHAR_HYPHEN_MINUS:45,CHAR_LEFT_ANGLE_BRACKET:60,CHAR_LEFT_CURLY_BRACE:123,CHAR_LEFT_SQUARE_BRACKET:91,CHAR_LINE_FEED:10,CHAR_NO_BREAK_SPACE:160,CHAR_PERCENT:37,CHAR_PLUS:43,CHAR_QUESTION_MARK:63,CHAR_RIGHT_ANGLE_BRACKET:62,CHAR_RIGHT_CURLY_BRACE:125,CHAR_RIGHT_SQUARE_BRACKET:93,CHAR_SEMICOLON:59,CHAR_SINGLE_QUOTE:39,CHAR_SPACE:32,CHAR_TAB:9,CHAR_UNDERSCORE:95,CHAR_VERTICAL_LINE:124,CHAR_ZERO_WIDTH_NOBREAK_SPACE:65279,SEP:so.sep,extglobChars(s){return{"!":{type:"negate",open:"(?:(?!(?:",close:`))${s.STAR})`},"?":{type:"qmark",open:"(?:",close:")?"},"+":{type:"plus",open:"(?:",close:")+"},"*":{type:"star",open:"(?:",close:")*"},"@":{type:"at",open:"(?:",close:")"}}},globChars(s){return s===!0?ho:zs}}});var ct=L(re=>{"use strict";var go=require("path"),mo=process.platform==="win32",{REGEX_BACKSLASH:wo,REGEX_REMOVE_BACKSLASH:vo,REGEX_SPECIAL_CHARS:yo,REGEX_SPECIAL_CHARS_GLOBAL:_o}=He();re.isObject=s=>s!==null&&typeof s=="object"&&!Array.isArray(s);re.hasRegexChars=s=>yo.test(s);re.isRegexChar=s=>s.length===1&&re.hasRegexChars(s);re.escapeRegex=s=>s.replace(_o,"\\$1");re.toPosixSlashes=s=>s.replace(wo,"/");re.removeBackslashes=s=>s.replace(vo,e=>e==="\\"?"":e);re.supportsLookbehinds=()=>{let s=process.version.slice(1).split(".").map(Number);return s.length===3&&s[0]>=9||s[0]===8&&s[1]>=10};re.isWindows=s=>s&&typeof s.windows=="boolean"?s.windows:mo===!0||go.sep==="\\";re.escapeLast=(s,e,t)=>{let n=s.lastIndexOf(e,t);return n===-1?s:s[n-1]==="\\"?re.escapeLast(s,e,n-1):`${s.slice(0,n)}\\${s.slice(n)}`};re.removePrefix=(s,e={})=>{let t=s;return t.startsWith("./")&&(t=t.slice(2),e.prefix="./"),t};re.wrapOutput=(s,e={},t={})=>{let n=t.contains?"":"^",r=t.contains?"":"$",i=`${n}(?:${s})${r}`;return e.negated===!0&&(i=`(?:^(?!${i}).*$)`),i}});var tn=L((kc,en)=>{"use strict";var Ks=ct(),{CHAR_ASTERISK:Bt,CHAR_AT:bo,CHAR_BACKWARD_SLASH:Le,CHAR_COMMA:ko,CHAR_DOT:jt,CHAR_EXCLAMATION_MARK:Wt,CHAR_FORWARD_SLASH:Js,CHAR_LEFT_CURLY_BRACE:Ut,CHAR_LEFT_PARENTHESES:qt,CHAR_LEFT_SQUARE_BRACKET:xo,CHAR_PLUS:Co,CHAR_QUESTION_MARK:Ys,CHAR_RIGHT_CURLY_BRACE:Ro,CHAR_RIGHT_PARENTHESES:Qs,CHAR_RIGHT_SQUARE_BRACKET:Eo}=He(),Xs=s=>s===Js||s===Le,Zs=s=>{s.isPrefix!==!0&&(s.depth=s.isGlobstar?1/0:1)},Po=(s,e)=>{let t=e||{},n=s.length-1,r=t.parts===!0||t.scanToEnd===!0,i=[],o=[],a=[],c=s,d=-1,u=0,p=0,l=!1,f=!1,v=!1,y=!1,x=!1,T=!1,S=!1,C=!1,F=!1,$=!1,R=0,O,b,I={value:"",depth:0,isGlob:!1},B=()=>d>=n,w=()=>c.charCodeAt(d+1),P=()=>(O=b,c.charCodeAt(++d));for(;d<n;){b=P();let J;if(b===Le){S=I.backslashes=!0,b=P(),b===Ut&&(T=!0);continue}if(T===!0||b===Ut){for(R++;B()!==!0&&(b=P());){if(b===Le){S=I.backslashes=!0,P();continue}if(b===Ut){R++;continue}if(T!==!0&&b===jt&&(b=P())===jt){if(l=I.isBrace=!0,v=I.isGlob=!0,$=!0,r===!0)continue;break}if(T!==!0&&b===ko){if(l=I.isBrace=!0,v=I.isGlob=!0,$=!0,r===!0)continue;break}if(b===Ro&&(R--,R===0)){T=!1,l=I.isBrace=!0,$=!0;break}}if(r===!0)continue;break}if(b===Js){if(i.push(d),o.push(I),I={value:"",depth:0,isGlob:!1},$===!0)continue;if(O===jt&&d===u+1){u+=2;continue}p=d+1;continue}if(t.noext!==!0&&(b===Co||b===bo||b===Bt||b===Ys||b===Wt)===!0&&w()===qt){if(v=I.isGlob=!0,y=I.isExtglob=!0,$=!0,b===Wt&&d===u&&(F=!0),r===!0){for(;B()!==!0&&(b=P());){if(b===Le){S=I.backslashes=!0,b=P();continue}if(b===Qs){v=I.isGlob=!0,$=!0;break}}continue}break}if(b===Bt){if(O===Bt&&(x=I.isGlobstar=!0),v=I.isGlob=!0,$=!0,r===!0)continue;break}if(b===Ys){if(v=I.isGlob=!0,$=!0,r===!0)continue;break}if(b===xo){for(;B()!==!0&&(J=P());){if(J===Le){S=I.backslashes=!0,P();continue}if(J===Eo){f=I.isBracket=!0,v=I.isGlob=!0,$=!0;break}}if(r===!0)continue;break}if(t.nonegate!==!0&&b===Wt&&d===u){C=I.negated=!0,u++;continue}if(t.noparen!==!0&&b===qt){if(v=I.isGlob=!0,r===!0){for(;B()!==!0&&(b=P());){if(b===qt){S=I.backslashes=!0,b=P();continue}if(b===Qs){$=!0;break}}continue}break}if(v===!0){if($=!0,r===!0)continue;break}}t.noext===!0&&(y=!1,v=!1);let A=c,q="",g="";u>0&&(q=c.slice(0,u),c=c.slice(u),p-=u),A&&v===!0&&p>0?(A=c.slice(0,p),g=c.slice(p)):v===!0?(A="",g=c):A=c,A&&A!==""&&A!=="/"&&A!==c&&Xs(A.charCodeAt(A.length-1))&&(A=A.slice(0,-1)),t.unescape===!0&&(g&&(g=Ks.removeBackslashes(g)),A&&S===!0&&(A=Ks.removeBackslashes(A)));let m={prefix:q,input:s,start:u,base:A,glob:g,isBrace:l,isBracket:f,isGlob:v,isExtglob:y,isGlobstar:x,negated:C,negatedExtglob:F};if(t.tokens===!0&&(m.maxDepth=0,Xs(b)||o.push(I),m.tokens=o),t.parts===!0||t.tokens===!0){let J;for(let H=0;H<i.length;H++){let he=J?J+1:u,fe=i[H],oe=s.slice(he,fe);t.tokens&&(H===0&&u!==0?(o[H].isPrefix=!0,o[H].value=q):o[H].value=oe,Zs(o[H]),m.maxDepth+=o[H].depth),(H!==0||oe!=="")&&a.push(oe),J=fe}if(J&&J+1<s.length){let H=s.slice(J+1);a.push(H),t.tokens&&(o[o.length-1].value=H,Zs(o[o.length-1]),m.maxDepth+=o[o.length-1].depth)}m.slashes=i,m.parts=a}return m};en.exports=Po});var rn=L((xc,nn)=>{"use strict";var lt=He(),ie=ct(),{MAX_LENGTH:dt,POSIX_REGEX_SOURCE:So,REGEX_NON_SPECIAL_CHARS:Ao,REGEX_SPECIAL_CHARS_BACKREF:To,REPLACEMENTS:sn}=lt,$o=(s,e)=>{if(typeof e.expandRange=="function")return e.expandRange(...s,e);s.sort();let t=`[${s.join("-")}]`;try{new RegExp(t)}catch{return s.map(r=>ie.escapeRegex(r)).join("..")}return t},Ee=(s,e)=>`Missing ${s}: "${e}" - use "\\\\${e}" to match literal characters`,Gt=(s,e)=>{if(typeof s!="string")throw new TypeError("Expected a string");s=sn[s]||s;let t={...e},n=typeof t.maxLength=="number"?Math.min(dt,t.maxLength):dt,r=s.length;if(r>n)throw new SyntaxError(`Input length: ${r}, exceeds maximum allowed length: ${n}`);let i={type:"bos",value:"",output:t.prepend||""},o=[i],a=t.capture?"":"?:",c=ie.isWindows(e),d=lt.globChars(c),u=lt.extglobChars(d),{DOT_LITERAL:p,PLUS_LITERAL:l,SLASH_LITERAL:f,ONE_CHAR:v,DOTS_SLASH:y,NO_DOT:x,NO_DOT_SLASH:T,NO_DOTS_SLASH:S,QMARK:C,QMARK_NO_DOT:F,STAR:$,START_ANCHOR:R}=d,O=k=>`(${a}(?:(?!${R}${k.dot?y:p}).)*?)`,b=t.dot?"":x,I=t.dot?C:F,B=t.bash===!0?O(t):$;t.capture&&(B=`(${B})`),typeof t.noext=="boolean"&&(t.noextglob=t.noext);let w={input:s,index:-1,start:0,dot:t.dot===!0,consumed:"",output:"",prefix:"",backtrack:!1,negated:!1,brackets:0,braces:0,parens:0,quotes:0,globstar:!1,tokens:o};s=ie.removePrefix(s,w),r=s.length;let P=[],A=[],q=[],g=i,m,J=()=>w.index===r-1,H=w.peek=(k=1)=>s[w.index+k],he=w.advance=()=>s[++w.index]||"",fe=()=>s.slice(w.index+1),oe=(k="",W=0)=>{w.consumed+=k,w.index+=W},et=k=>{w.output+=k.output!=null?k.output:k.value,oe(k.value)},zr=()=>{let k=1;for(;H()==="!"&&(H(2)!=="("||H(3)==="?");)he(),w.start++,k++;return k%2===0?!1:(w.negated=!0,w.start++,!0)},tt=k=>{w[k]++,q.push(k)},ye=k=>{w[k]--,q.pop()},D=k=>{if(g.type==="globstar"){let W=w.braces>0&&(k.type==="comma"||k.type==="brace"),_=k.extglob===!0||P.length&&(k.type==="pipe"||k.type==="paren");k.type!=="slash"&&k.type!=="paren"&&!W&&!_&&(w.output=w.output.slice(0,-g.output.length),g.type="star",g.value="*",g.output=B,w.output+=g.output)}if(P.length&&k.type!=="paren"&&(P[P.length-1].inner+=k.value),(k.value||k.output)&&et(k),g&&g.type==="text"&&k.type==="text"){g.value+=k.value,g.output=(g.output||"")+k.value;return}k.prev=g,o.push(k),g=k},st=(k,W)=>{let _={...u[W],conditions:1,inner:""};_.prev=g,_.parens=w.parens,_.output=w.output;let M=(t.capture?"(":"")+_.open;tt("parens"),D({type:k,value:W,output:w.output?"":v}),D({type:"paren",extglob:!0,value:he(),output:M}),P.push(_)},Vr=k=>{let W=k.close+(t.capture?")":""),_;if(k.type==="negate"){let M=B;if(k.inner&&k.inner.length>1&&k.inner.includes("/")&&(M=O(t)),(M!==B||J()||/^\)+$/.test(fe()))&&(W=k.close=`)$))${M}`),k.inner.includes("*")&&(_=fe())&&/^\.[^\\/.]+$/.test(_)){let G=Gt(_,{...e,fastpaths:!1}).output;W=k.close=`)${G})${M})`}k.prev.type==="bos"&&(w.negatedExtglob=!0)}D({type:"paren",extglob:!0,value:m,output:W}),ye("parens")};if(t.fastpaths!==!1&&!/(^[*!]|[/()[\]{}"])/.test(s)){let k=!1,W=s.replace(To,(_,M,G,ne,Y,Lt)=>ne==="\\"?(k=!0,_):ne==="?"?M?M+ne+(Y?C.repeat(Y.length):""):Lt===0?I+(Y?C.repeat(Y.length):""):C.repeat(G.length):ne==="."?p.repeat(G.length):ne==="*"?M?M+ne+(Y?B:""):B:M?_:`\\${_}`);return k===!0&&(t.unescape===!0?W=W.replace(/\\/g,""):W=W.replace(/\\+/g,_=>_.length%2===0?"\\\\":_?"\\":"")),W===s&&t.contains===!0?(w.output=s,w):(w.output=ie.wrapOutput(W,w,e),w)}for(;!J();){if(m=he(),m==="\0")continue;if(m==="\\"){let _=H();if(_==="/"&&t.bash!==!0||_==="."||_===";")continue;if(!_){m+="\\",D({type:"text",value:m});continue}let M=/^\\+/.exec(fe()),G=0;if(M&&M[0].length>2&&(G=M[0].length,w.index+=G,G%2!==0&&(m+="\\")),t.unescape===!0?m=he():m+=he(),w.brackets===0){D({type:"text",value:m});continue}}if(w.brackets>0&&(m!=="]"||g.value==="["||g.value==="[^")){if(t.posix!==!1&&m===":"){let _=g.value.slice(1);if(_.includes("[")&&(g.posix=!0,_.includes(":"))){let M=g.value.lastIndexOf("["),G=g.value.slice(0,M),ne=g.value.slice(M+2),Y=So[ne];if(Y){g.value=G+Y,w.backtrack=!0,he(),!i.output&&o.indexOf(g)===1&&(i.output=v);continue}}}(m==="["&&H()!==":"||m==="-"&&H()==="]")&&(m=`\\${m}`),m==="]"&&(g.value==="["||g.value==="[^")&&(m=`\\${m}`),t.posix===!0&&m==="!"&&g.value==="["&&(m="^"),g.value+=m,et({value:m});continue}if(w.quotes===1&&m!=='"'){m=ie.escapeRegex(m),g.value+=m,et({value:m});continue}if(m==='"'){w.quotes=w.quotes===1?0:1,t.keepQuotes===!0&&D({type:"text",value:m});continue}if(m==="("){tt("parens"),D({type:"paren",value:m});continue}if(m===")"){if(w.parens===0&&t.strictBrackets===!0)throw new SyntaxError(Ee("opening","("));let _=P[P.length-1];if(_&&w.parens===_.parens+1){Vr(P.pop());continue}D({type:"paren",value:m,output:w.parens?")":"\\)"}),ye("parens");continue}if(m==="["){if(t.nobracket===!0||!fe().includes("]")){if(t.nobracket!==!0&&t.strictBrackets===!0)throw new SyntaxError(Ee("closing","]"));m=`\\${m}`}else tt("brackets");D({type:"bracket",value:m});continue}if(m==="]"){if(t.nobracket===!0||g&&g.type==="bracket"&&g.value.length===1){D({type:"text",value:m,output:`\\${m}`});continue}if(w.brackets===0){if(t.strictBrackets===!0)throw new SyntaxError(Ee("opening","["));D({type:"text",value:m,output:`\\${m}`});continue}ye("brackets");let _=g.value.slice(1);if(g.posix!==!0&&_[0]==="^"&&!_.includes("/")&&(m=`/${m}`),g.value+=m,et({value:m}),t.literalBrackets===!1||ie.hasRegexChars(_))continue;let M=ie.escapeRegex(g.value);if(w.output=w.output.slice(0,-g.value.length),t.literalBrackets===!0){w.output+=M,g.value=M;continue}g.value=`(${a}${M}|${g.value})`,w.output+=g.value;continue}if(m==="{"&&t.nobrace!==!0){tt("braces");let _={type:"brace",value:m,output:"(",outputIndex:w.output.length,tokensIndex:w.tokens.length};A.push(_),D(_);continue}if(m==="}"){let _=A[A.length-1];if(t.nobrace===!0||!_){D({type:"text",value:m,output:m});continue}let M=")";if(_.dots===!0){let G=o.slice(),ne=[];for(let Y=G.length-1;Y>=0&&(o.pop(),G[Y].type!=="brace");Y--)G[Y].type!=="dots"&&ne.unshift(G[Y].value);M=$o(ne,t),w.backtrack=!0}if(_.comma!==!0&&_.dots!==!0){let G=w.output.slice(0,_.outputIndex),ne=w.tokens.slice(_.tokensIndex);_.value=_.output="\\{",m=M="\\}",w.output=G;for(let Y of ne)w.output+=Y.output||Y.value}D({type:"brace",value:m,output:M}),ye("braces"),A.pop();continue}if(m==="|"){P.length>0&&P[P.length-1].conditions++,D({type:"text",value:m});continue}if(m===","){let _=m,M=A[A.length-1];M&&q[q.length-1]==="braces"&&(M.comma=!0,_="|"),D({type:"comma",value:m,output:_});continue}if(m==="/"){if(g.type==="dot"&&w.index===w.start+1){w.start=w.index+1,w.consumed="",w.output="",o.pop(),g=i;continue}D({type:"slash",value:m,output:f});continue}if(m==="."){if(w.braces>0&&g.type==="dot"){g.value==="."&&(g.output=p);let _=A[A.length-1];g.type="dots",g.output+=m,g.value+=m,_.dots=!0;continue}if(w.braces+w.parens===0&&g.type!=="bos"&&g.type!=="slash"){D({type:"text",value:m,output:p});continue}D({type:"dot",value:m,output:p});continue}if(m==="?"){if(!(g&&g.value==="(")&&t.noextglob!==!0&&H()==="("&&H(2)!=="?"){st("qmark",m);continue}if(g&&g.type==="paren"){let M=H(),G=m;if(M==="<"&&!ie.supportsLookbehinds())throw new Error("Node.js v10 or higher is required for regex lookbehinds");(g.value==="("&&!/[!=<:]/.test(M)||M==="<"&&!/<([!=]|\w+>)/.test(fe()))&&(G=`\\${m}`),D({type:"text",value:m,output:G});continue}if(t.dot!==!0&&(g.type==="slash"||g.type==="bos")){D({type:"qmark",value:m,output:F});continue}D({type:"qmark",value:m,output:C});continue}if(m==="!"){if(t.noextglob!==!0&&H()==="("&&(H(2)!=="?"||!/[!=<:]/.test(H(3)))){st("negate",m);continue}if(t.nonegate!==!0&&w.index===0){zr();continue}}if(m==="+"){if(t.noextglob!==!0&&H()==="("&&H(2)!=="?"){st("plus",m);continue}if(g&&g.value==="("||t.regex===!1){D({type:"plus",value:m,output:l});continue}if(g&&(g.type==="bracket"||g.type==="paren"||g.type==="brace")||w.parens>0){D({type:"plus",value:m});continue}D({type:"plus",value:l});continue}if(m==="@"){if(t.noextglob!==!0&&H()==="("&&H(2)!=="?"){D({type:"at",extglob:!0,value:m,output:""});continue}D({type:"text",value:m});continue}if(m!=="*"){(m==="$"||m==="^")&&(m=`\\${m}`);let _=Ao.exec(fe());_&&(m+=_[0],w.index+=_[0].length),D({type:"text",value:m});continue}if(g&&(g.type==="globstar"||g.star===!0)){g.type="star",g.star=!0,g.value+=m,g.output=B,w.backtrack=!0,w.globstar=!0,oe(m);continue}let k=fe();if(t.noextglob!==!0&&/^\([^?]/.test(k)){st("star",m);continue}if(g.type==="star"){if(t.noglobstar===!0){oe(m);continue}let _=g.prev,M=_.prev,G=_.type==="slash"||_.type==="bos",ne=M&&(M.type==="star"||M.type==="globstar");if(t.bash===!0&&(!G||k[0]&&k[0]!=="/")){D({type:"star",value:m,output:""});continue}let Y=w.braces>0&&(_.type==="comma"||_.type==="brace"),Lt=P.length&&(_.type==="pipe"||_.type==="paren");if(!G&&_.type!=="paren"&&!Y&&!Lt){D({type:"star",value:m,output:""});continue}for(;k.slice(0,3)==="/**";){let nt=s[w.index+4];if(nt&&nt!=="/")break;k=k.slice(3),oe("/**",3)}if(_.type==="bos"&&J()){g.type="globstar",g.value+=m,g.output=O(t),w.output=g.output,w.globstar=!0,oe(m);continue}if(_.type==="slash"&&_.prev.type!=="bos"&&!ne&&J()){w.output=w.output.slice(0,-(_.output+g.output).length),_.output=`(?:${_.output}`,g.type="globstar",g.output=O(t)+(t.strictSlashes?")":"|$)"),g.value+=m,w.globstar=!0,w.output+=_.output+g.output,oe(m);continue}if(_.type==="slash"&&_.prev.type!=="bos"&&k[0]==="/"){let nt=k[1]!==void 0?"|$":"";w.output=w.output.slice(0,-(_.output+g.output).length),_.output=`(?:${_.output}`,g.type="globstar",g.output=`${O(t)}${f}|${f}${nt})`,g.value+=m,w.output+=_.output+g.output,w.globstar=!0,oe(m+he()),D({type:"slash",value:"/",output:""});continue}if(_.type==="bos"&&k[0]==="/"){g.type="globstar",g.value+=m,g.output=`(?:^|${f}|${O(t)}${f})`,w.output=g.output,w.globstar=!0,oe(m+he()),D({type:"slash",value:"/",output:""});continue}w.output=w.output.slice(0,-g.output.length),g.type="globstar",g.output=O(t),g.value+=m,w.output+=g.output,w.globstar=!0,oe(m);continue}let W={type:"star",value:m,output:B};if(t.bash===!0){W.output=".*?",(g.type==="bos"||g.type==="slash")&&(W.output=b+W.output),D(W);continue}if(g&&(g.type==="bracket"||g.type==="paren")&&t.regex===!0){W.output=m,D(W);continue}(w.index===w.start||g.type==="slash"||g.type==="dot")&&(g.type==="dot"?(w.output+=T,g.output+=T):t.dot===!0?(w.output+=S,g.output+=S):(w.output+=b,g.output+=b),H()!=="*"&&(w.output+=v,g.output+=v)),D(W)}for(;w.brackets>0;){if(t.strictBrackets===!0)throw new SyntaxError(Ee("closing","]"));w.output=ie.escapeLast(w.output,"["),ye("brackets")}for(;w.parens>0;){if(t.strictBrackets===!0)throw new SyntaxError(Ee("closing",")"));w.output=ie.escapeLast(w.output,"("),ye("parens")}for(;w.braces>0;){if(t.strictBrackets===!0)throw new SyntaxError(Ee("closing","}"));w.output=ie.escapeLast(w.output,"{"),ye("braces")}if(t.strictSlashes!==!0&&(g.type==="star"||g.type==="bracket")&&D({type:"maybe_slash",value:"",output:`${f}?`}),w.backtrack===!0){w.output="";for(let k of w.tokens)w.output+=k.output!=null?k.output:k.value,k.suffix&&(w.output+=k.suffix)}return w};Gt.fastpaths=(s,e)=>{let t={...e},n=typeof t.maxLength=="number"?Math.min(dt,t.maxLength):dt,r=s.length;if(r>n)throw new SyntaxError(`Input length: ${r}, exceeds maximum allowed length: ${n}`);s=sn[s]||s;let i=ie.isWindows(e),{DOT_LITERAL:o,SLASH_LITERAL:a,ONE_CHAR:c,DOTS_SLASH:d,NO_DOT:u,NO_DOTS:p,NO_DOTS_SLASH:l,STAR:f,START_ANCHOR:v}=lt.globChars(i),y=t.dot?p:u,x=t.dot?l:u,T=t.capture?"":"?:",S={negated:!1,prefix:""},C=t.bash===!0?".*?":f;t.capture&&(C=`(${C})`);let F=b=>b.noglobstar===!0?C:`(${T}(?:(?!${v}${b.dot?d:o}).)*?)`,$=b=>{switch(b){case"*":return`${y}${c}${C}`;case".*":return`${o}${c}${C}`;case"*.*":return`${y}${C}${o}${c}${C}`;case"*/*":return`${y}${C}${a}${c}${x}${C}`;case"**":return y+F(t);case"**/*":return`(?:${y}${F(t)}${a})?${x}${c}${C}`;case"**/*.*":return`(?:${y}${F(t)}${a})?${x}${C}${o}${c}${C}`;case"**/.*":return`(?:${y}${F(t)}${a})?${o}${c}${C}`;default:{let I=/^(.*?)\.(\w+)$/.exec(b);if(!I)return;let B=$(I[1]);return B?B+o+I[2]:void 0}}},R=ie.removePrefix(s,S),O=$(R);return O&&t.strictSlashes!==!0&&(O+=`${a}?`),O};nn.exports=Gt});var an=L((Cc,on)=>{"use strict";var Io=require("path"),Mo=tn(),zt=rn(),Vt=ct(),Do=He(),Fo=s=>s&&typeof s=="object"&&!Array.isArray(s),K=(s,e,t=!1)=>{if(Array.isArray(s)){let u=s.map(l=>K(l,e,t));return l=>{for(let f of u){let v=f(l);if(v)return v}return!1}}let n=Fo(s)&&s.tokens&&s.input;if(s===""||typeof s!="string"&&!n)throw new TypeError("Expected pattern to be a non-empty string");let r=e||{},i=Vt.isWindows(e),o=n?K.compileRe(s,e):K.makeRe(s,e,!1,!0),a=o.state;delete o.state;let c=()=>!1;if(r.ignore){let u={...e,ignore:null,onMatch:null,onResult:null};c=K(r.ignore,u,t)}let d=(u,p=!1)=>{let{isMatch:l,match:f,output:v}=K.test(u,o,e,{glob:s,posix:i}),y={glob:s,state:a,regex:o,posix:i,input:u,output:v,match:f,isMatch:l};return typeof r.onResult=="function"&&r.onResult(y),l===!1?(y.isMatch=!1,p?y:!1):c(u)?(typeof r.onIgnore=="function"&&r.onIgnore(y),y.isMatch=!1,p?y:!1):(typeof r.onMatch=="function"&&r.onMatch(y),p?y:!0)};return t&&(d.state=a),d};K.test=(s,e,t,{glob:n,posix:r}={})=>{if(typeof s!="string")throw new TypeError("Expected input to be a string");if(s==="")return{isMatch:!1,output:""};let i=t||{},o=i.format||(r?Vt.toPosixSlashes:null),a=s===n,c=a&&o?o(s):s;return a===!1&&(c=o?o(s):s,a=c===n),(a===!1||i.capture===!0)&&(i.matchBase===!0||i.basename===!0?a=K.matchBase(s,e,t,r):a=e.exec(c)),{isMatch:!!a,match:a,output:c}};K.matchBase=(s,e,t,n=Vt.isWindows(t))=>(e instanceof RegExp?e:K.makeRe(e,t)).test(Io.basename(s));K.isMatch=(s,e,t)=>K(e,t)(s);K.parse=(s,e)=>Array.isArray(s)?s.map(t=>K.parse(t,e)):zt(s,{...e,fastpaths:!1});K.scan=(s,e)=>Mo(s,e);K.compileRe=(s,e,t=!1,n=!1)=>{if(t===!0)return s.output;let r=e||{},i=r.contains?"":"^",o=r.contains?"":"$",a=`${i}(?:${s.output})${o}`;s&&s.negated===!0&&(a=`^(?!${a}).*$`);let c=K.toRegex(a,e);return n===!0&&(c.state=s),c};K.makeRe=(s,e={},t=!1,n=!1)=>{if(!s||typeof s!="string")throw new TypeError("Expected a non-empty string");let r={negated:!1,fastpaths:!0};return e.fastpaths!==!1&&(s[0]==="."||s[0]==="*")&&(r.output=zt.fastpaths(s,e)),r.output||(r=zt(s,e)),K.compileRe(r,e,t,n)};K.toRegex=(s,e)=>{try{let t=e||{};return new RegExp(s,t.flags||(t.nocase?"i":""))}catch(t){if(e&&e.debug===!0)throw t;return/$^/}};K.constants=Do;on.exports=K});var Kt=L((Rc,cn)=>{"use strict";cn.exports=an()});var mn=L((Ec,gn)=>{"use strict";var Oe=require("fs"),{Readable:Ho}=require("stream"),Ne=require("path"),{promisify:ft}=require("util"),Yt=Kt(),Lo=ft(Oe.readdir),No=ft(Oe.stat),ln=ft(Oe.lstat),Oo=ft(Oe.realpath),Bo="!",hn="READDIRP_RECURSIVE_ERROR",jo=new Set(["ENOENT","EPERM","EACCES","ELOOP",hn]),Qt="files",fn="directories",pt="files_directories",ut="all",dn=[Qt,fn,pt,ut],Wo=s=>jo.has(s.code),[un,Uo]=process.versions.node.split(".").slice(0,2).map(s=>Number.parseInt(s,10)),qo=process.platform==="win32"&&(un>10||un===10&&Uo>=5),pn=s=>{if(s!==void 0){if(typeof s=="function")return s;if(typeof s=="string"){let e=Yt(s.trim());return t=>e(t.basename)}if(Array.isArray(s)){let e=[],t=[];for(let n of s){let r=n.trim();r.charAt(0)===Bo?t.push(Yt(r.slice(1))):e.push(Yt(r))}return t.length>0?e.length>0?n=>e.some(r=>r(n.basename))&&!t.some(r=>r(n.basename)):n=>!t.some(r=>r(n.basename)):n=>e.some(r=>r(n.basename))}}},ht=class s extends Ho{static get defaultOptions(){return{root:".",fileFilter:e=>!0,directoryFilter:e=>!0,type:Qt,lstat:!1,depth:2147483648,alwaysStat:!1}}constructor(e={}){super({objectMode:!0,autoDestroy:!0,highWaterMark:e.highWaterMark||4096});let t={...s.defaultOptions,...e},{root:n,type:r}=t;this._fileFilter=pn(t.fileFilter),this._directoryFilter=pn(t.directoryFilter);let i=t.lstat?ln:No;qo?this._stat=o=>i(o,{bigint:!0}):this._stat=i,this._maxDepth=t.depth,this._wantsDir=[fn,pt,ut].includes(r),this._wantsFile=[Qt,pt,ut].includes(r),this._wantsEverything=r===ut,this._root=Ne.resolve(n),this._isDirent="Dirent"in Oe&&!t.alwaysStat,this._statsProp=this._isDirent?"dirent":"stats",this._rdOptions={encoding:"utf8",withFileTypes:this._isDirent},this.parents=[this._exploreDir(n,1)],this.reading=!1,this.parent=void 0}async _read(e){if(!this.reading){this.reading=!0;try{for(;!this.destroyed&&e>0;){let{path:t,depth:n,files:r=[]}=this.parent||{};if(r.length>0){let i=r.splice(0,e).map(o=>this._formatEntry(o,t));for(let o of await Promise.all(i)){if(this.destroyed)return;let a=await this._getEntryType(o);a==="directory"&&this._directoryFilter(o)?(n<=this._maxDepth&&this.parents.push(this._exploreDir(o.fullPath,n+1)),this._wantsDir&&(this.push(o),e--)):(a==="file"||this._includeAsFile(o))&&this._fileFilter(o)&&this._wantsFile&&(this.push(o),e--)}}else{let i=this.parents.pop();if(!i){this.push(null);break}if(this.parent=await i,this.destroyed)return}}}catch(t){this.destroy(t)}finally{this.reading=!1}}}async _exploreDir(e,t){let n;try{n=await Lo(e,this._rdOptions)}catch(r){this._onError(r)}return{files:n,depth:t,path:e}}async _formatEntry(e,t){let n;try{let r=this._isDirent?e.name:e,i=Ne.resolve(Ne.join(t,r));n={path:Ne.relative(this._root,i),fullPath:i,basename:r},n[this._statsProp]=this._isDirent?e:await this._stat(i)}catch(r){this._onError(r)}return n}_onError(e){Wo(e)&&!this.destroyed?this.emit("warn",e):this.destroy(e)}async _getEntryType(e){let t=e&&e[this._statsProp];if(t){if(t.isFile())return"file";if(t.isDirectory())return"directory";if(t&&t.isSymbolicLink()){let n=e.fullPath;try{let r=await Oo(n),i=await ln(r);if(i.isFile())return"file";if(i.isDirectory()){let o=r.length;if(n.startsWith(r)&&n.substr(o,1)===Ne.sep){let a=new Error(`Circular symlink detected: "${n}" points to "${r}"`);return a.code=hn,this._onError(a)}return"directory"}}catch(r){this._onError(r)}}}}_includeAsFile(e){let t=e&&e[this._statsProp];return t&&this._wantsEverything&&!t.isDirectory()}},Pe=(s,e={})=>{let t=e.entryType||e.type;if(t==="both"&&(t=pt),t&&(e.type=t),s){if(typeof s!="string")throw new TypeError("readdirp: root argument must be a string. Usage: readdirp(root, options)");if(t&&!dn.includes(t))throw new Error(`readdirp: Invalid type passed. Use one of ${dn.join(", ")}`)}else throw new Error("readdirp: root argument is required. Usage: readdirp(root, options)");return e.root=s,new ht(e)},Go=(s,e={})=>new Promise((t,n)=>{let r=[];Pe(s,e).on("data",i=>r.push(i)).on("end",()=>t(r)).on("error",i=>n(i))});Pe.promise=Go;Pe.ReaddirpStream=ht;Pe.default=Pe;gn.exports=Pe});var Xt=L((Pc,wn)=>{wn.exports=function(s,e){if(typeof s!="string")throw new TypeError("expected path to be a string");if(s==="\\"||s==="/")return"/";var t=s.length;if(t<=1)return s;var n="";if(t>4&&s[3]==="\\"){var r=s[2];(r==="?"||r===".")&&s.slice(0,2)==="\\\\"&&(s=s.slice(2),n="//")}var i=s.split(/[/\\]+/);return e!==!1&&i[i.length-1]===""&&i.pop(),n+i.join("/")}});var xn=L((bn,kn)=>{"use strict";Object.defineProperty(bn,"__esModule",{value:!0});var _n=Kt(),zo=Xt(),vn="!",Vo={returnIndex:!1},Ko=s=>Array.isArray(s)?s:[s],Yo=(s,e)=>{if(typeof s=="function")return s;if(typeof s=="string"){let t=_n(s,e);return n=>s===n||t(n)}return s instanceof RegExp?t=>s.test(t):t=>!1},yn=(s,e,t,n)=>{let r=Array.isArray(t),i=r?t[0]:t;if(!r&&typeof i!="string")throw new TypeError("anymatch: second argument must be a string: got "+Object.prototype.toString.call(i));let o=zo(i,!1);for(let c=0;c<e.length;c++){let d=e[c];if(d(o))return n?-1:!1}let a=r&&[o].concat(t.slice(1));for(let c=0;c<s.length;c++){let d=s[c];if(r?d(...a):d(o))return n?c:!0}return n?-1:!1},Zt=(s,e,t=Vo)=>{if(s==null)throw new TypeError("anymatch: specify first argument");let n=typeof t=="boolean"?{returnIndex:t}:t,r=n.returnIndex||!1,i=Ko(s),o=i.filter(c=>typeof c=="string"&&c.charAt(0)===vn).map(c=>c.slice(1)).map(c=>_n(c,n)),a=i.filter(c=>typeof c!="string"||typeof c=="string"&&c.charAt(0)!==vn).map(c=>Yo(c,n));return e==null?(c,d=!1)=>yn(a,o,c,typeof d=="boolean"?d:!1):yn(a,o,e,r)};Zt.default=Zt;kn.exports=Zt});var Rn=L((Sc,Cn)=>{Cn.exports=function(e){if(typeof e!="string"||e==="")return!1;for(var t;t=/(\\).|([@?!+*]\(.*\))/g.exec(e);){if(t[2])return!0;e=e.slice(t.index+t[0].length)}return!1}});var Jt=L((Ac,Pn)=>{var Qo=Rn(),En={"{":"}","(":")","[":"]"},Xo=function(s){if(s[0]==="!")return!0;for(var e=0,t=-2,n=-2,r=-2,i=-2,o=-2;e<s.length;){if(s[e]==="*"||s[e+1]==="?"&&/[\].+)]/.test(s[e])||n!==-1&&s[e]==="["&&s[e+1]!=="]"&&(n<e&&(n=s.indexOf("]",e)),n>e&&(o===-1||o>n||(o=s.indexOf("\\",e),o===-1||o>n)))||r!==-1&&s[e]==="{"&&s[e+1]!=="}"&&(r=s.indexOf("}",e),r>e&&(o=s.indexOf("\\",e),o===-1||o>r))||i!==-1&&s[e]==="("&&s[e+1]==="?"&&/[:!=]/.test(s[e+2])&&s[e+3]!==")"&&(i=s.indexOf(")",e),i>e&&(o=s.indexOf("\\",e),o===-1||o>i))||t!==-1&&s[e]==="("&&s[e+1]!=="|"&&(t<e&&(t=s.indexOf("|",e)),t!==-1&&s[t+1]!==")"&&(i=s.indexOf(")",t),i>t&&(o=s.indexOf("\\",t),o===-1||o>i))))return!0;if(s[e]==="\\"){var a=s[e+1];e+=2;var c=En[a];if(c){var d=s.indexOf(c,e);d!==-1&&(e=d+1)}if(s[e]==="!")return!0}else e++}return!1},Zo=function(s){if(s[0]==="!")return!0;for(var e=0;e<s.length;){if(/[*?{}()[\]]/.test(s[e]))return!0;if(s[e]==="\\"){var t=s[e+1];e+=2;var n=En[t];if(n){var r=s.indexOf(n,e);r!==-1&&(e=r+1)}if(s[e]==="!")return!0}else e++}return!1};Pn.exports=function(e,t){if(typeof e!="string"||e==="")return!1;if(Qo(e))return!0;var n=Xo;return t&&t.strict===!1&&(n=Zo),n(e)}});var An=L((Tc,Sn)=>{"use strict";var Jo=Jt(),ei=require("path").posix.dirname,ti=require("os").platform()==="win32",es="/",si=/\\/g,ni=/[\{\[].*[\}\]]$/,ri=/(^|[^\\])([\{\[]|\([^\)]+$)/,oi=/\\([\!\*\?\|\[\]\(\)\{\}])/g;Sn.exports=function(e,t){var n=Object.assign({flipBackslashes:!0},t);n.flipBackslashes&&ti&&e.indexOf(es)<0&&(e=e.replace(si,es)),ni.test(e)&&(e+=es),e+="a";do e=ei(e);while(Jo(e)||ri.test(e));return e.replace(oi,"$1")}});var gt=L(le=>{"use strict";le.isInteger=s=>typeof s=="number"?Number.isInteger(s):typeof s=="string"&&s.trim()!==""?Number.isInteger(Number(s)):!1;le.find=(s,e)=>s.nodes.find(t=>t.type===e);le.exceedsLimit=(s,e,t=1,n)=>n===!1||!le.isInteger(s)||!le.isInteger(e)?!1:(Number(e)-Number(s))/Number(t)>=n;le.escapeNode=(s,e=0,t)=>{let n=s.nodes[e];n&&(t&&n.type===t||n.type==="open"||n.type==="close")&&n.escaped!==!0&&(n.value="\\"+n.value,n.escaped=!0)};le.encloseBrace=s=>s.type!=="brace"?!1:s.commas>>0+s.ranges>>0===0?(s.invalid=!0,!0):!1;le.isInvalidBrace=s=>s.type!=="brace"?!1:s.invalid===!0||s.dollar?!0:s.commas>>0+s.ranges>>0===0||s.open!==!0||s.close!==!0?(s.invalid=!0,!0):!1;le.isOpenOrClose=s=>s.type==="open"||s.type==="close"?!0:s.open===!0||s.close===!0;le.reduce=s=>s.reduce((e,t)=>(t.type==="text"&&e.push(t.value),t.type==="range"&&(t.type="text"),e),[]);le.flatten=(...s)=>{let e=[],t=n=>{for(let r=0;r<n.length;r++){let i=n[r];if(Array.isArray(i)){t(i);continue}i!==void 0&&e.push(i)}return e};return t(s),e}});var mt=L((Ic,$n)=>{"use strict";var Tn=gt();$n.exports=(s,e={})=>{let t=(n,r={})=>{let i=e.escapeInvalid&&Tn.isInvalidBrace(r),o=n.invalid===!0&&e.escapeInvalid===!0,a="";if(n.value)return(i||o)&&Tn.isOpenOrClose(n)?"\\"+n.value:n.value;if(n.value)return n.value;if(n.nodes)for(let c of n.nodes)a+=t(c);return a};return t(s)}});var Mn=L((Mc,In)=>{"use strict";In.exports=function(s){return typeof s=="number"?s-s===0:typeof s=="string"&&s.trim()!==""?Number.isFinite?Number.isFinite(+s):isFinite(+s):!1}});var Wn=L((Dc,jn)=>{"use strict";var Dn=Mn(),_e=(s,e,t)=>{if(Dn(s)===!1)throw new TypeError("toRegexRange: expected the first argument to be a number");if(e===void 0||s===e)return String(s);if(Dn(e)===!1)throw new TypeError("toRegexRange: expected the second argument to be a number.");let n={relaxZeros:!0,...t};typeof n.strictZeros=="boolean"&&(n.relaxZeros=n.strictZeros===!1);let r=String(n.relaxZeros),i=String(n.shorthand),o=String(n.capture),a=String(n.wrap),c=s+":"+e+"="+r+i+o+a;if(_e.cache.hasOwnProperty(c))return _e.cache[c].result;let d=Math.min(s,e),u=Math.max(s,e);if(Math.abs(d-u)===1){let y=s+"|"+e;return n.capture?`(${y})`:n.wrap===!1?y:`(?:${y})`}let p=Bn(s)||Bn(e),l={min:s,max:e,a:d,b:u},f=[],v=[];if(p&&(l.isPadded=p,l.maxLen=String(l.max).length),d<0){let y=u<0?Math.abs(u):1;v=Fn(y,Math.abs(d),l,n),d=l.a=0}return u>=0&&(f=Fn(d,u,l,n)),l.negatives=v,l.positives=f,l.result=ii(v,f,n),n.capture===!0?l.result=`(${l.result})`:n.wrap!==!1&&f.length+v.length>1&&(l.result=`(?:${l.result})`),_e.cache[c]=l,l.result};function ii(s,e,t){let n=ts(s,e,"-",!1,t)||[],r=ts(e,s,"",!1,t)||[],i=ts(s,e,"-?",!0,t)||[];return n.concat(i).concat(r).join("|")}function ai(s,e){let t=1,n=1,r=Ln(s,t),i=new Set([e]);for(;s<=r&&r<=e;)i.add(r),t+=1,r=Ln(s,t);for(r=Nn(e+1,n)-1;s<r&&r<=e;)i.add(r),n+=1,r=Nn(e+1,n)-1;return i=[...i],i.sort(di),i}function ci(s,e,t){if(s===e)return{pattern:s,count:[],digits:0};let n=li(s,e),r=n.length,i="",o=0;for(let a=0;a<r;a++){let[c,d]=n[a];c===d?i+=c:c!=="0"||d!=="9"?i+=ui(c,d,t):o++}return o&&(i+=t.shorthand===!0?"\\d":"[0-9]"),{pattern:i,count:[o],digits:r}}function Fn(s,e,t,n){let r=ai(s,e),i=[],o=s,a;for(let c=0;c<r.length;c++){let d=r[c],u=ci(String(o),String(d),n),p="";if(!t.isPadded&&a&&a.pattern===u.pattern){a.count.length>1&&a.count.pop(),a.count.push(u.count[0]),a.string=a.pattern+On(a.count),o=d+1;continue}t.isPadded&&(p=pi(d,t,n)),u.string=p+u.pattern+On(u.count),i.push(u),o=d+1,a=u}return i}function ts(s,e,t,n,r){let i=[];for(let o of s){let{string:a}=o;!n&&!Hn(e,"string",a)&&i.push(t+a),n&&Hn(e,"string",a)&&i.push(t+a)}return i}function li(s,e){let t=[];for(let n=0;n<s.length;n++)t.push([s[n],e[n]]);return t}function di(s,e){return s>e?1:e>s?-1:0}function Hn(s,e,t){return s.some(n=>n[e]===t)}function Ln(s,e){return Number(String(s).slice(0,-e)+"9".repeat(e))}function Nn(s,e){return s-s%Math.pow(10,e)}function On(s){let[e=0,t=""]=s;return t||e>1?`{${e+(t?","+t:"")}}`:""}function ui(s,e,t){return`[${s}${e-s===1?"":"-"}${e}]`}function Bn(s){return/^-?(0+)\d/.test(s)}function pi(s,e,t){if(!e.isPadded)return s;let n=Math.abs(e.maxLen-String(s).length),r=t.relaxZeros!==!1;switch(n){case 0:return"";case 1:return r?"0?":"0";case 2:return r?"0{0,2}":"00";default:return r?`0{0,${n}}`:`0{${n}}`}}_e.cache={};_e.clearCache=()=>_e.cache={};jn.exports=_e});var rs=L((Fc,Yn)=>{"use strict";var hi=require("util"),qn=Wn(),Un=s=>s!==null&&typeof s=="object"&&!Array.isArray(s),fi=s=>e=>s===!0?Number(e):String(e),ss=s=>typeof s=="number"||typeof s=="string"&&s!=="",Be=s=>Number.isInteger(+s),ns=s=>{let e=`${s}`,t=-1;if(e[0]==="-"&&(e=e.slice(1)),e==="0")return!1;for(;e[++t]==="0";);return t>0},gi=(s,e,t)=>typeof s=="string"||typeof e=="string"?!0:t.stringify===!0,mi=(s,e,t)=>{if(e>0){let n=s[0]==="-"?"-":"";n&&(s=s.slice(1)),s=n+s.padStart(n?e-1:e,"0")}return t===!1?String(s):s},vt=(s,e)=>{let t=s[0]==="-"?"-":"";for(t&&(s=s.slice(1),e--);s.length<e;)s="0"+s;return t?"-"+s:s},wi=(s,e,t)=>{s.negatives.sort((a,c)=>a<c?-1:a>c?1:0),s.positives.sort((a,c)=>a<c?-1:a>c?1:0);let n=e.capture?"":"?:",r="",i="",o;return s.positives.length&&(r=s.positives.map(a=>vt(String(a),t)).join("|")),s.negatives.length&&(i=`-(${n}${s.negatives.map(a=>vt(String(a),t)).join("|")})`),r&&i?o=`${r}|${i}`:o=r||i,e.wrap?`(${n}${o})`:o},Gn=(s,e,t,n)=>{if(t)return qn(s,e,{wrap:!1,...n});let r=String.fromCharCode(s);if(s===e)return r;let i=String.fromCharCode(e);return`[${r}-${i}]`},zn=(s,e,t)=>{if(Array.isArray(s)){let n=t.wrap===!0,r=t.capture?"":"?:";return n?`(${r}${s.join("|")})`:s.join("|")}return qn(s,e,t)},Vn=(...s)=>new RangeError("Invalid range arguments: "+hi.inspect(...s)),Kn=(s,e,t)=>{if(t.strictRanges===!0)throw Vn([s,e]);return[]},vi=(s,e)=>{if(e.strictRanges===!0)throw new TypeError(`Expected step "${s}" to be a number`);return[]},yi=(s,e,t=1,n={})=>{let r=Number(s),i=Number(e);if(!Number.isInteger(r)||!Number.isInteger(i)){if(n.strictRanges===!0)throw Vn([s,e]);return[]}r===0&&(r=0),i===0&&(i=0);let o=r>i,a=String(s),c=String(e),d=String(t);t=Math.max(Math.abs(t),1);let u=ns(a)||ns(c)||ns(d),p=u?Math.max(a.length,c.length,d.length):0,l=u===!1&&gi(s,e,n)===!1,f=n.transform||fi(l);if(n.toRegex&&t===1)return Gn(vt(s,p),vt(e,p),!0,n);let v={negatives:[],positives:[]},y=S=>v[S<0?"negatives":"positives"].push(Math.abs(S)),x=[],T=0;for(;o?r>=i:r<=i;)n.toRegex===!0&&t>1?y(r):x.push(mi(f(r,T),p,l)),r=o?r-t:r+t,T++;return n.toRegex===!0?t>1?wi(v,n,p):zn(x,null,{wrap:!1,...n}):x},_i=(s,e,t=1,n={})=>{if(!Be(s)&&s.length>1||!Be(e)&&e.length>1)return Kn(s,e,n);let r=n.transform||(l=>String.fromCharCode(l)),i=`${s}`.charCodeAt(0),o=`${e}`.charCodeAt(0),a=i>o,c=Math.min(i,o),d=Math.max(i,o);if(n.toRegex&&t===1)return Gn(c,d,!1,n);let u=[],p=0;for(;a?i>=o:i<=o;)u.push(r(i,p)),i=a?i-t:i+t,p++;return n.toRegex===!0?zn(u,null,{wrap:!1,options:n}):u},wt=(s,e,t,n={})=>{if(e==null&&ss(s))return[s];if(!ss(s)||!ss(e))return Kn(s,e,n);if(typeof t=="function")return wt(s,e,1,{transform:t});if(Un(t))return wt(s,e,0,t);let r={...n};return r.capture===!0&&(r.wrap=!0),t=t||r.step||1,Be(t)?Be(s)&&Be(e)?yi(s,e,t,r):_i(s,e,Math.max(Math.abs(t),1),r):t!=null&&!Un(t)?vi(t,r):wt(s,e,1,t)};Yn.exports=wt});var Zn=L((Hc,Xn)=>{"use strict";var bi=rs(),Qn=gt(),ki=(s,e={})=>{let t=(n,r={})=>{let i=Qn.isInvalidBrace(r),o=n.invalid===!0&&e.escapeInvalid===!0,a=i===!0||o===!0,c=e.escapeInvalid===!0?"\\":"",d="";if(n.isOpen===!0)return c+n.value;if(n.isClose===!0)return console.log("node.isClose",c,n.value),c+n.value;if(n.type==="open")return a?c+n.value:"(";if(n.type==="close")return a?c+n.value:")";if(n.type==="comma")return n.prev.type==="comma"?"":a?n.value:"|";if(n.value)return n.value;if(n.nodes&&n.ranges>0){let u=Qn.reduce(n.nodes),p=bi(...u,{...e,wrap:!1,toRegex:!0,strictZeros:!0});if(p.length!==0)return u.length>1&&p.length>1?`(${p})`:p}if(n.nodes)for(let u of n.nodes)d+=t(u,n);return d};return t(s)};Xn.exports=ki});var tr=L((Lc,er)=>{"use strict";var xi=rs(),Jn=mt(),Se=gt(),be=(s="",e="",t=!1)=>{let n=[];if(s=[].concat(s),e=[].concat(e),!e.length)return s;if(!s.length)return t?Se.flatten(e).map(r=>`{${r}}`):e;for(let r of s)if(Array.isArray(r))for(let i of r)n.push(be(i,e,t));else for(let i of e)t===!0&&typeof i=="string"&&(i=`{${i}}`),n.push(Array.isArray(i)?be(r,i,t):r+i);return Se.flatten(n)},Ci=(s,e={})=>{let t=e.rangeLimit===void 0?1e3:e.rangeLimit,n=(r,i={})=>{r.queue=[];let o=i,a=i.queue;for(;o.type!=="brace"&&o.type!=="root"&&o.parent;)o=o.parent,a=o.queue;if(r.invalid||r.dollar){a.push(be(a.pop(),Jn(r,e)));return}if(r.type==="brace"&&r.invalid!==!0&&r.nodes.length===2){a.push(be(a.pop(),["{}"]));return}if(r.nodes&&r.ranges>0){let p=Se.reduce(r.nodes);if(Se.exceedsLimit(...p,e.step,t))throw new RangeError("expanded array length exceeds range limit. Use options.rangeLimit to increase or disable the limit.");let l=xi(...p,e);l.length===0&&(l=Jn(r,e)),a.push(be(a.pop(),l)),r.nodes=[];return}let c=Se.encloseBrace(r),d=r.queue,u=r;for(;u.type!=="brace"&&u.type!=="root"&&u.parent;)u=u.parent,d=u.queue;for(let p=0;p<r.nodes.length;p++){let l=r.nodes[p];if(l.type==="comma"&&r.type==="brace"){p===1&&d.push(""),d.push("");continue}if(l.type==="close"){a.push(be(a.pop(),d,c));continue}if(l.value&&l.type!=="open"){d.push(be(d.pop(),l.value));continue}l.nodes&&n(l,r)}return d};return Se.flatten(n(s))};er.exports=Ci});var nr=L((Nc,sr)=>{"use strict";sr.exports={MAX_LENGTH:1e4,CHAR_0:"0",CHAR_9:"9",CHAR_UPPERCASE_A:"A",CHAR_LOWERCASE_A:"a",CHAR_UPPERCASE_Z:"Z",CHAR_LOWERCASE_Z:"z",CHAR_LEFT_PARENTHESES:"(",CHAR_RIGHT_PARENTHESES:")",CHAR_ASTERISK:"*",CHAR_AMPERSAND:"&",CHAR_AT:"@",CHAR_BACKSLASH:"\\",CHAR_BACKTICK:"`",CHAR_CARRIAGE_RETURN:"\r",CHAR_CIRCUMFLEX_ACCENT:"^",CHAR_COLON:":",CHAR_COMMA:",",CHAR_DOLLAR:"$",CHAR_DOT:".",CHAR_DOUBLE_QUOTE:'"',CHAR_EQUAL:"=",CHAR_EXCLAMATION_MARK:"!",CHAR_FORM_FEED:"\f",CHAR_FORWARD_SLASH:"/",CHAR_HASH:"#",CHAR_HYPHEN_MINUS:"-",CHAR_LEFT_ANGLE_BRACKET:"<",CHAR_LEFT_CURLY_BRACE:"{",CHAR_LEFT_SQUARE_BRACKET:"[",CHAR_LINE_FEED:`
`,CHAR_NO_BREAK_SPACE:"\xA0",CHAR_PERCENT:"%",CHAR_PLUS:"+",CHAR_QUESTION_MARK:"?",CHAR_RIGHT_ANGLE_BRACKET:">",CHAR_RIGHT_CURLY_BRACE:"}",CHAR_RIGHT_SQUARE_BRACKET:"]",CHAR_SEMICOLON:";",CHAR_SINGLE_QUOTE:"'",CHAR_SPACE:" ",CHAR_TAB:"	",CHAR_UNDERSCORE:"_",CHAR_VERTICAL_LINE:"|",CHAR_ZERO_WIDTH_NOBREAK_SPACE:"\uFEFF"}});var cr=L((Oc,ar)=>{"use strict";var Ri=mt(),{MAX_LENGTH:rr,CHAR_BACKSLASH:os,CHAR_BACKTICK:Ei,CHAR_COMMA:Pi,CHAR_DOT:Si,CHAR_LEFT_PARENTHESES:Ai,CHAR_RIGHT_PARENTHESES:Ti,CHAR_LEFT_CURLY_BRACE:$i,CHAR_RIGHT_CURLY_BRACE:Ii,CHAR_LEFT_SQUARE_BRACKET:or,CHAR_RIGHT_SQUARE_BRACKET:ir,CHAR_DOUBLE_QUOTE:Mi,CHAR_SINGLE_QUOTE:Di,CHAR_NO_BREAK_SPACE:Fi,CHAR_ZERO_WIDTH_NOBREAK_SPACE:Hi}=nr(),Li=(s,e={})=>{if(typeof s!="string")throw new TypeError("Expected a string");let t=e||{},n=typeof t.maxLength=="number"?Math.min(rr,t.maxLength):rr;if(s.length>n)throw new SyntaxError(`Input length (${s.length}), exceeds max characters (${n})`);let r={type:"root",input:s,nodes:[]},i=[r],o=r,a=r,c=0,d=s.length,u=0,p=0,l,f=()=>s[u++],v=y=>{if(y.type==="text"&&a.type==="dot"&&(a.type="text"),a&&a.type==="text"&&y.type==="text"){a.value+=y.value;return}return o.nodes.push(y),y.parent=o,y.prev=a,a=y,y};for(v({type:"bos"});u<d;)if(o=i[i.length-1],l=f(),!(l===Hi||l===Fi)){if(l===os){v({type:"text",value:(e.keepEscaping?l:"")+f()});continue}if(l===ir){v({type:"text",value:"\\"+l});continue}if(l===or){c++;let y;for(;u<d&&(y=f());){if(l+=y,y===or){c++;continue}if(y===os){l+=f();continue}if(y===ir&&(c--,c===0))break}v({type:"text",value:l});continue}if(l===Ai){o=v({type:"paren",nodes:[]}),i.push(o),v({type:"text",value:l});continue}if(l===Ti){if(o.type!=="paren"){v({type:"text",value:l});continue}o=i.pop(),v({type:"text",value:l}),o=i[i.length-1];continue}if(l===Mi||l===Di||l===Ei){let y=l,x;for(e.keepQuotes!==!0&&(l="");u<d&&(x=f());){if(x===os){l+=x+f();continue}if(x===y){e.keepQuotes===!0&&(l+=x);break}l+=x}v({type:"text",value:l});continue}if(l===$i){p++;let x={type:"brace",open:!0,close:!1,dollar:a.value&&a.value.slice(-1)==="$"||o.dollar===!0,depth:p,commas:0,ranges:0,nodes:[]};o=v(x),i.push(o),v({type:"open",value:l});continue}if(l===Ii){if(o.type!=="brace"){v({type:"text",value:l});continue}let y="close";o=i.pop(),o.close=!0,v({type:y,value:l}),p--,o=i[i.length-1];continue}if(l===Pi&&p>0){if(o.ranges>0){o.ranges=0;let y=o.nodes.shift();o.nodes=[y,{type:"text",value:Ri(o)}]}v({type:"comma",value:l}),o.commas++;continue}if(l===Si&&p>0&&o.commas===0){let y=o.nodes;if(p===0||y.length===0){v({type:"text",value:l});continue}if(a.type==="dot"){if(o.range=[],a.value+=l,a.type="range",o.nodes.length!==3&&o.nodes.length!==5){o.invalid=!0,o.ranges=0,a.type="text";continue}o.ranges++,o.args=[];continue}if(a.type==="range"){y.pop();let x=y[y.length-1];x.value+=a.value+l,a=x,o.ranges--;continue}v({type:"dot",value:l});continue}v({type:"text",value:l})}do if(o=i.pop(),o.type!=="root"){o.nodes.forEach(T=>{T.nodes||(T.type==="open"&&(T.isOpen=!0),T.type==="close"&&(T.isClose=!0),T.nodes||(T.type="text"),T.invalid=!0)});let y=i[i.length-1],x=y.nodes.indexOf(o);y.nodes.splice(x,1,...o.nodes)}while(i.length>0);return v({type:"eos"}),r};ar.exports=Li});var ur=L((Bc,dr)=>{"use strict";var lr=mt(),Ni=Zn(),Oi=tr(),Bi=cr(),ae=(s,e={})=>{let t=[];if(Array.isArray(s))for(let n of s){let r=ae.create(n,e);Array.isArray(r)?t.push(...r):t.push(r)}else t=[].concat(ae.create(s,e));return e&&e.expand===!0&&e.nodupes===!0&&(t=[...new Set(t)]),t};ae.parse=(s,e={})=>Bi(s,e);ae.stringify=(s,e={})=>lr(typeof s=="string"?ae.parse(s,e):s,e);ae.compile=(s,e={})=>(typeof s=="string"&&(s=ae.parse(s,e)),Ni(s,e));ae.expand=(s,e={})=>{typeof s=="string"&&(s=ae.parse(s,e));let t=Oi(s,e);return e.noempty===!0&&(t=t.filter(Boolean)),e.nodupes===!0&&(t=[...new Set(t)]),t};ae.create=(s,e={})=>s===""||s.length<3?[s]:e.expand!==!0?ae.compile(s,e):ae.expand(s,e);dr.exports=ae});var pr=L((jc,ji)=>{ji.exports=["3dm","3ds","3g2","3gp","7z","a","aac","adp","afdesign","afphoto","afpub","ai","aif","aiff","alz","ape","apk","appimage","ar","arj","asf","au","avi","bak","baml","bh","bin","bk","bmp","btif","bz2","bzip2","cab","caf","cgm","class","cmx","cpio","cr2","cur","dat","dcm","deb","dex","djvu","dll","dmg","dng","doc","docm","docx","dot","dotm","dra","DS_Store","dsk","dts","dtshd","dvb","dwg","dxf","ecelp4800","ecelp7470","ecelp9600","egg","eol","eot","epub","exe","f4v","fbs","fh","fla","flac","flatpak","fli","flv","fpx","fst","fvt","g3","gh","gif","graffle","gz","gzip","h261","h263","h264","icns","ico","ief","img","ipa","iso","jar","jpeg","jpg","jpgv","jpm","jxr","key","ktx","lha","lib","lvp","lz","lzh","lzma","lzo","m3u","m4a","m4v","mar","mdi","mht","mid","midi","mj2","mka","mkv","mmr","mng","mobi","mov","movie","mp3","mp4","mp4a","mpeg","mpg","mpga","mxu","nef","npx","numbers","nupkg","o","odp","ods","odt","oga","ogg","ogv","otf","ott","pages","pbm","pcx","pdb","pdf","pea","pgm","pic","png","pnm","pot","potm","potx","ppa","ppam","ppm","pps","ppsm","ppsx","ppt","pptm","pptx","psd","pya","pyc","pyo","pyv","qt","rar","ras","raw","resources","rgb","rip","rlc","rmf","rmvb","rpm","rtf","rz","s3m","s7z","scpt","sgi","shar","snap","sil","sketch","slk","smv","snk","so","stl","suo","sub","swf","tar","tbz","tbz2","tga","tgz","thmx","tif","tiff","tlz","ttc","ttf","txz","udf","uvh","uvi","uvm","uvp","uvs","uvu","viv","vob","war","wav","wax","wbmp","wdp","weba","webm","webp","whl","wim","wm","wma","wmv","wmx","woff","woff2","wrm","wvx","xbm","xif","xla","xlam","xls","xlsb","xlsm","xlsx","xlt","xltm","xltx","xm","xmind","xpi","xpm","xwd","xz","z","zip","zipx"]});var fr=L((Wc,hr)=>{hr.exports=pr()});var mr=L((Uc,gr)=>{"use strict";var Wi=require("path"),Ui=fr(),qi=new Set(Ui);gr.exports=s=>qi.has(Wi.extname(s).slice(1).toLowerCase())});var yt=L(E=>{"use strict";var{sep:Gi}=require("path"),{platform:is}=process,zi=require("os");E.EV_ALL="all";E.EV_READY="ready";E.EV_ADD="add";E.EV_CHANGE="change";E.EV_ADD_DIR="addDir";E.EV_UNLINK="unlink";E.EV_UNLINK_DIR="unlinkDir";E.EV_RAW="raw";E.EV_ERROR="error";E.STR_DATA="data";E.STR_END="end";E.STR_CLOSE="close";E.FSEVENT_CREATED="created";E.FSEVENT_MODIFIED="modified";E.FSEVENT_DELETED="deleted";E.FSEVENT_MOVED="moved";E.FSEVENT_CLONED="cloned";E.FSEVENT_UNKNOWN="unknown";E.FSEVENT_FLAG_MUST_SCAN_SUBDIRS=1;E.FSEVENT_TYPE_FILE="file";E.FSEVENT_TYPE_DIRECTORY="directory";E.FSEVENT_TYPE_SYMLINK="symlink";E.KEY_LISTENERS="listeners";E.KEY_ERR="errHandlers";E.KEY_RAW="rawEmitters";E.HANDLER_KEYS=[E.KEY_LISTENERS,E.KEY_ERR,E.KEY_RAW];E.DOT_SLASH=`.${Gi}`;E.BACK_SLASH_RE=/\\/g;E.DOUBLE_SLASH_RE=/\/\//;E.SLASH_OR_BACK_SLASH_RE=/[/\\]/;E.DOT_RE=/\..*\.(sw[px])$|~$|\.subl.*\.tmp/;E.REPLACER_RE=/^\.[/\\]/;E.SLASH="/";E.SLASH_SLASH="//";E.BRACE_START="{";E.BANG="!";E.ONE_DOT=".";E.TWO_DOTS="..";E.STAR="*";E.GLOBSTAR="**";E.ROOT_GLOBSTAR="/**/*";E.SLASH_GLOBSTAR="/**";E.DIR_SUFFIX="Dir";E.ANYMATCH_OPTS={dot:!0};E.STRING_TYPE="string";E.FUNCTION_TYPE="function";E.EMPTY_STR="";E.EMPTY_FN=()=>{};E.IDENTITY_FN=s=>s;E.isWindows=is==="win32";E.isMacos=is==="darwin";E.isLinux=is==="linux";E.isIBMi=zi.type()==="OS400"});var kr=L((Gc,br)=>{"use strict";var ve=require("fs"),X=require("path"),{promisify:qe}=require("util"),Vi=mr(),{isWindows:Ki,isLinux:Yi,EMPTY_FN:Qi,EMPTY_STR:Xi,KEY_LISTENERS:Ae,KEY_ERR:as,KEY_RAW:je,HANDLER_KEYS:Zi,EV_CHANGE:bt,EV_ADD:_t,EV_ADD_DIR:Ji,EV_ERROR:vr,STR_DATA:ea,STR_END:ta,BRACE_START:sa,STAR:na}=yt(),ra="watch",oa=qe(ve.open),yr=qe(ve.stat),ia=qe(ve.lstat),aa=qe(ve.close),cs=qe(ve.realpath),ca={lstat:ia,stat:yr},ds=(s,e)=>{s instanceof Set?s.forEach(e):e(s)},We=(s,e,t)=>{let n=s[e];n instanceof Set||(s[e]=n=new Set([n])),n.add(t)},la=s=>e=>{let t=s[e];t instanceof Set?t.clear():delete s[e]},Ue=(s,e,t)=>{let n=s[e];n instanceof Set?n.delete(t):n===t&&delete s[e]},_r=s=>s instanceof Set?s.size===0:!s,kt=new Map;function wr(s,e,t,n,r){let i=(o,a)=>{t(s),r(o,a,{watchedPath:s}),a&&s!==a&&xt(X.resolve(s,a),Ae,X.join(s,a))};try{return ve.watch(s,e,i)}catch(o){n(o)}}var xt=(s,e,t,n,r)=>{let i=kt.get(s);i&&ds(i[e],o=>{o(t,n,r)})},da=(s,e,t,n)=>{let{listener:r,errHandler:i,rawEmitter:o}=n,a=kt.get(e),c;if(!t.persistent)return c=wr(s,t,r,i,o),c.close.bind(c);if(a)We(a,Ae,r),We(a,as,i),We(a,je,o);else{if(c=wr(s,t,xt.bind(null,e,Ae),i,xt.bind(null,e,je)),!c)return;c.on(vr,async d=>{let u=xt.bind(null,e,as);if(a.watcherUnusable=!0,Ki&&d.code==="EPERM")try{let p=await oa(s,"r");await aa(p),u(d)}catch{}else u(d)}),a={listeners:r,errHandlers:i,rawEmitters:o,watcher:c},kt.set(e,a)}return()=>{Ue(a,Ae,r),Ue(a,as,i),Ue(a,je,o),_r(a.listeners)&&(a.watcher.close(),kt.delete(e),Zi.forEach(la(a)),a.watcher=void 0,Object.freeze(a))}},ls=new Map,ua=(s,e,t,n)=>{let{listener:r,rawEmitter:i}=n,o=ls.get(e),a=new Set,c=new Set,d=o&&o.options;return d&&(d.persistent<t.persistent||d.interval>t.interval)&&(a=o.listeners,c=o.rawEmitters,ve.unwatchFile(e),o=void 0),o?(We(o,Ae,r),We(o,je,i)):(o={listeners:r,rawEmitters:i,options:t,watcher:ve.watchFile(e,t,(u,p)=>{ds(o.rawEmitters,f=>{f(bt,e,{curr:u,prev:p})});let l=u.mtimeMs;(u.size!==p.size||l>p.mtimeMs||l===0)&&ds(o.listeners,f=>f(s,u))})},ls.set(e,o)),()=>{Ue(o,Ae,r),Ue(o,je,i),_r(o.listeners)&&(ls.delete(e),ve.unwatchFile(e),o.options=o.watcher=void 0,Object.freeze(o))}},us=class{constructor(e){this.fsw=e,this._boundHandleError=t=>e._handleError(t)}_watchWithNodeFs(e,t){let n=this.fsw.options,r=X.dirname(e),i=X.basename(e);this.fsw._getWatchedDir(r).add(i);let a=X.resolve(e),c={persistent:n.persistent};t||(t=Qi);let d;return n.usePolling?(c.interval=n.enableBinaryInterval&&Vi(i)?n.binaryInterval:n.interval,d=ua(e,a,c,{listener:t,rawEmitter:this.fsw._emitRaw})):d=da(e,a,c,{listener:t,errHandler:this._boundHandleError,rawEmitter:this.fsw._emitRaw}),d}_handleFile(e,t,n){if(this.fsw.closed)return;let r=X.dirname(e),i=X.basename(e),o=this.fsw._getWatchedDir(r),a=t;if(o.has(i))return;let c=async(u,p)=>{if(this.fsw._throttle(ra,e,5)){if(!p||p.mtimeMs===0)try{let l=await yr(e);if(this.fsw.closed)return;let f=l.atimeMs,v=l.mtimeMs;(!f||f<=v||v!==a.mtimeMs)&&this.fsw._emit(bt,e,l),Yi&&a.ino!==l.ino?(this.fsw._closeFile(u),a=l,this.fsw._addPathCloser(u,this._watchWithNodeFs(e,c))):a=l}catch{this.fsw._remove(r,i)}else if(o.has(i)){let l=p.atimeMs,f=p.mtimeMs;(!l||l<=f||f!==a.mtimeMs)&&this.fsw._emit(bt,e,p),a=p}}},d=this._watchWithNodeFs(e,c);if(!(n&&this.fsw.options.ignoreInitial)&&this.fsw._isntIgnored(e)){if(!this.fsw._throttle(_t,e,0))return;this.fsw._emit(_t,e,t)}return d}async _handleSymlink(e,t,n,r){if(this.fsw.closed)return;let i=e.fullPath,o=this.fsw._getWatchedDir(t);if(!this.fsw.options.followSymlinks){this.fsw._incrReadyCount();let a;try{a=await cs(n)}catch{return this.fsw._emitReady(),!0}return this.fsw.closed?void 0:(o.has(r)?this.fsw._symlinkPaths.get(i)!==a&&(this.fsw._symlinkPaths.set(i,a),this.fsw._emit(bt,n,e.stats)):(o.add(r),this.fsw._symlinkPaths.set(i,a),this.fsw._emit(_t,n,e.stats)),this.fsw._emitReady(),!0)}if(this.fsw._symlinkPaths.has(i))return!0;this.fsw._symlinkPaths.set(i,!0)}_handleRead(e,t,n,r,i,o,a){if(e=X.join(e,Xi),!n.hasGlob&&(a=this.fsw._throttle("readdir",e,1e3),!a))return;let c=this.fsw._getWatchedDir(n.path),d=new Set,u=this.fsw._readdirp(e,{fileFilter:p=>n.filterPath(p),directoryFilter:p=>n.filterDir(p),depth:0}).on(ea,async p=>{if(this.fsw.closed){u=void 0;return}let l=p.path,f=X.join(e,l);if(d.add(l),!(p.stats.isSymbolicLink()&&await this._handleSymlink(p,e,f,l))){if(this.fsw.closed){u=void 0;return}(l===r||!r&&!c.has(l))&&(this.fsw._incrReadyCount(),f=X.join(i,X.relative(i,f)),this._addToNodeFs(f,t,n,o+1))}}).on(vr,this._boundHandleError);return new Promise(p=>u.once(ta,()=>{if(this.fsw.closed){u=void 0;return}let l=a?a.clear():!1;p(),c.getChildren().filter(f=>f!==e&&!d.has(f)&&(!n.hasGlob||n.filterPath({fullPath:X.resolve(e,f)}))).forEach(f=>{this.fsw._remove(e,f)}),u=void 0,l&&this._handleRead(e,!1,n,r,i,o,a)}))}async _handleDir(e,t,n,r,i,o,a){let c=this.fsw._getWatchedDir(X.dirname(e)),d=c.has(X.basename(e));!(n&&this.fsw.options.ignoreInitial)&&!i&&!d&&(!o.hasGlob||o.globFilter(e))&&this.fsw._emit(Ji,e,t),c.add(X.basename(e)),this.fsw._getWatchedDir(e);let u,p,l=this.fsw.options.depth;if((l==null||r<=l)&&!this.fsw._symlinkPaths.has(a)){if(!i&&(await this._handleRead(e,n,o,i,e,r,u),this.fsw.closed))return;p=this._watchWithNodeFs(e,(f,v)=>{v&&v.mtimeMs===0||this._handleRead(f,!1,o,i,e,r,u)})}return p}async _addToNodeFs(e,t,n,r,i){let o=this.fsw._emitReady;if(this.fsw._isIgnored(e)||this.fsw.closed)return o(),!1;let a=this.fsw._getWatchHelpers(e,r);!a.hasGlob&&n&&(a.hasGlob=n.hasGlob,a.globFilter=n.globFilter,a.filterPath=c=>n.filterPath(c),a.filterDir=c=>n.filterDir(c));try{let c=await ca[a.statMethod](a.watchPath);if(this.fsw.closed)return;if(this.fsw._isIgnored(a.watchPath,c))return o(),!1;let d=this.fsw.options.followSymlinks&&!e.includes(na)&&!e.includes(sa),u;if(c.isDirectory()){let p=X.resolve(e),l=d?await cs(e):e;if(this.fsw.closed||(u=await this._handleDir(a.watchPath,c,t,r,i,a,l),this.fsw.closed))return;p!==l&&l!==void 0&&this.fsw._symlinkPaths.set(p,l)}else if(c.isSymbolicLink()){let p=d?await cs(e):e;if(this.fsw.closed)return;let l=X.dirname(a.watchPath);if(this.fsw._getWatchedDir(l).add(a.watchPath),this.fsw._emit(_t,a.watchPath,c),u=await this._handleDir(l,c,t,r,e,a,p),this.fsw.closed)return;p!==void 0&&this.fsw._symlinkPaths.set(X.resolve(e),p)}else u=this._handleFile(a.watchPath,c,t);return o(),this.fsw._addPathCloser(e,u),!1}catch(c){if(this.fsw._handleError(c))return o(),e}}};br.exports=us});var Ar=L((zc,ys)=>{"use strict";var ws=require("fs"),Z=require("path"),{promisify:vs}=require("util"),Te;try{Te=require("fsevents")}catch(s){process.env.CHOKIDAR_PRINT_FSEVENTS_REQUIRE_ERROR&&console.error(s)}if(Te){let s=process.version.match(/v(\d+)\.(\d+)/);if(s&&s[1]&&s[2]){let e=Number.parseInt(s[1],10),t=Number.parseInt(s[2],10);e===8&&t<16&&(Te=void 0)}}var{EV_ADD:ps,EV_CHANGE:pa,EV_ADD_DIR:xr,EV_UNLINK:Ct,EV_ERROR:ha,STR_DATA:fa,STR_END:ga,FSEVENT_CREATED:ma,FSEVENT_MODIFIED:wa,FSEVENT_DELETED:va,FSEVENT_MOVED:ya,FSEVENT_UNKNOWN:_a,FSEVENT_FLAG_MUST_SCAN_SUBDIRS:ba,FSEVENT_TYPE_FILE:ka,FSEVENT_TYPE_DIRECTORY:Ge,FSEVENT_TYPE_SYMLINK:Sr,ROOT_GLOBSTAR:Cr,DIR_SUFFIX:xa,DOT_SLASH:Rr,FUNCTION_TYPE:hs,EMPTY_FN:Ca,IDENTITY_FN:Ra}=yt(),Ea=s=>isNaN(s)?{}:{depth:s},gs=vs(ws.stat),Pa=vs(ws.lstat),Er=vs(ws.realpath),Sa={stat:gs,lstat:Pa},ke=new Map,Aa=10,Ta=new Set([69888,70400,71424,72704,73472,131328,131840,262912]),$a=(s,e)=>({stop:Te.watch(s,e)});function Ia(s,e,t,n){let r=Z.extname(e)?Z.dirname(e):e,i=Z.dirname(r),o=ke.get(r);Ma(i)&&(r=i);let a=Z.resolve(s),c=a!==e,d=(p,l,f)=>{c&&(p=p.replace(e,a)),(p===a||!p.indexOf(a+Z.sep))&&t(p,l,f)},u=!1;for(let p of ke.keys())if(e.indexOf(Z.resolve(p)+Z.sep)===0){r=p,o=ke.get(r),u=!0;break}return o||u?o.listeners.add(d):(o={listeners:new Set([d]),rawEmitter:n,watcher:$a(r,(p,l)=>{if(!o.listeners.size||l&ba)return;let f=Te.getInfo(p,l);o.listeners.forEach(v=>{v(p,l,f)}),o.rawEmitter(f.event,p,f)})},ke.set(r,o)),()=>{let p=o.listeners;if(p.delete(d),!p.size&&(ke.delete(r),o.watcher))return o.watcher.stop().then(()=>{o.rawEmitter=o.watcher=void 0,Object.freeze(o)})}}var Ma=s=>{let e=0;for(let t of ke.keys())if(t.indexOf(s)===0&&(e++,e>=Aa))return!0;return!1},Da=()=>Te&&ke.size<128,fs=(s,e)=>{let t=0;for(;!s.indexOf(e)&&(s=Z.dirname(s))!==e;)t++;return t},Pr=(s,e)=>s.type===Ge&&e.isDirectory()||s.type===Sr&&e.isSymbolicLink()||s.type===ka&&e.isFile(),ms=class{constructor(e){this.fsw=e}checkIgnored(e,t){let n=this.fsw._ignoredPaths;if(this.fsw._isIgnored(e,t))return n.add(e),t&&t.isDirectory()&&n.add(e+Cr),!0;n.delete(e),n.delete(e+Cr)}addOrChange(e,t,n,r,i,o,a,c){let d=i.has(o)?pa:ps;this.handleEvent(d,e,t,n,r,i,o,a,c)}async checkExists(e,t,n,r,i,o,a,c){try{let d=await gs(e);if(this.fsw.closed)return;Pr(a,d)?this.addOrChange(e,t,n,r,i,o,a,c):this.handleEvent(Ct,e,t,n,r,i,o,a,c)}catch(d){d.code==="EACCES"?this.addOrChange(e,t,n,r,i,o,a,c):this.handleEvent(Ct,e,t,n,r,i,o,a,c)}}handleEvent(e,t,n,r,i,o,a,c,d){if(!(this.fsw.closed||this.checkIgnored(t)))if(e===Ct){let u=c.type===Ge;(u||o.has(a))&&this.fsw._remove(i,a,u)}else{if(e===ps){if(c.type===Ge&&this.fsw._getWatchedDir(t),c.type===Sr&&d.followSymlinks){let p=d.depth===void 0?void 0:fs(n,r)+1;return this._addToFsEvents(t,!1,!0,p)}this.fsw._getWatchedDir(i).add(a)}let u=c.type===Ge?e+xa:e;this.fsw._emit(u,t),u===xr&&this._addToFsEvents(t,!1,!0)}}_watchWithFsEvents(e,t,n,r){if(this.fsw.closed||this.fsw._isIgnored(e))return;let i=this.fsw.options,a=Ia(e,t,async(c,d,u)=>{if(this.fsw.closed||i.depth!==void 0&&fs(c,t)>i.depth)return;let p=n(Z.join(e,Z.relative(e,c)));if(r&&!r(p))return;let l=Z.dirname(p),f=Z.basename(p),v=this.fsw._getWatchedDir(u.type===Ge?p:l);if(Ta.has(d)||u.event===_a)if(typeof i.ignored===hs){let y;try{y=await gs(p)}catch{}if(this.fsw.closed||this.checkIgnored(p,y))return;Pr(u,y)?this.addOrChange(p,c,t,l,v,f,u,i):this.handleEvent(Ct,p,c,t,l,v,f,u,i)}else this.checkExists(p,c,t,l,v,f,u,i);else switch(u.event){case ma:case wa:return this.addOrChange(p,c,t,l,v,f,u,i);case va:case ya:return this.checkExists(p,c,t,l,v,f,u,i)}},this.fsw._emitRaw);return this.fsw._emitReady(),a}async _handleFsEventsSymlink(e,t,n,r){if(!(this.fsw.closed||this.fsw._symlinkPaths.has(t))){this.fsw._symlinkPaths.set(t,!0),this.fsw._incrReadyCount();try{let i=await Er(e);if(this.fsw.closed)return;if(this.fsw._isIgnored(i))return this.fsw._emitReady();this.fsw._incrReadyCount(),this._addToFsEvents(i||e,o=>{let a=e;return i&&i!==Rr?a=o.replace(i,e):o!==Rr&&(a=Z.join(e,o)),n(a)},!1,r)}catch(i){if(this.fsw._handleError(i))return this.fsw._emitReady()}}}emitAdd(e,t,n,r,i){let o=n(e),a=t.isDirectory(),c=this.fsw._getWatchedDir(Z.dirname(o)),d=Z.basename(o);a&&this.fsw._getWatchedDir(o),!c.has(d)&&(c.add(d),(!r.ignoreInitial||i===!0)&&this.fsw._emit(a?xr:ps,o,t))}initWatch(e,t,n,r){if(this.fsw.closed)return;let i=this._watchWithFsEvents(n.watchPath,Z.resolve(e||n.watchPath),r,n.globFilter);this.fsw._addPathCloser(t,i)}async _addToFsEvents(e,t,n,r){if(this.fsw.closed)return;let i=this.fsw.options,o=typeof t===hs?t:Ra,a=this.fsw._getWatchHelpers(e);try{let c=await Sa[a.statMethod](a.watchPath);if(this.fsw.closed)return;if(this.fsw._isIgnored(a.watchPath,c))throw null;if(c.isDirectory()){if(a.globFilter||this.emitAdd(o(e),c,o,i,n),r&&r>i.depth)return;this.fsw._readdirp(a.watchPath,{fileFilter:d=>a.filterPath(d),directoryFilter:d=>a.filterDir(d),...Ea(i.depth-(r||0))}).on(fa,d=>{if(this.fsw.closed||d.stats.isDirectory()&&!a.filterPath(d))return;let u=Z.join(a.watchPath,d.path),{fullPath:p}=d;if(a.followSymlinks&&d.stats.isSymbolicLink()){let l=i.depth===void 0?void 0:fs(u,Z.resolve(a.watchPath))+1;this._handleFsEventsSymlink(u,p,o,l)}else this.emitAdd(u,d.stats,o,i,n)}).on(ha,Ca).on(ga,()=>{this.fsw._emitReady()})}else this.emitAdd(a.watchPath,c,o,i,n),this.fsw._emitReady()}catch(c){(!c||this.fsw._handleError(c))&&(this.fsw._emitReady(),this.fsw._emitReady())}if(i.persistent&&n!==!0)if(typeof t===hs)this.initWatch(void 0,e,a,o);else{let c;try{c=await Er(a.watchPath)}catch{}this.initWatch(c,e,a,o)}}};ys.exports=ms;ys.exports.canUse=Da});var Fs=L(Ds=>{"use strict";var{EventEmitter:Fa}=require("events"),Is=require("fs"),N=require("path"),{promisify:Hr}=require("util"),Ha=mn(),Rs=xn().default,La=An(),_s=Jt(),Na=ur(),Oa=Xt(),Ba=kr(),Tr=Ar(),{EV_ALL:bs,EV_READY:ja,EV_ADD:Rt,EV_CHANGE:ze,EV_UNLINK:$r,EV_ADD_DIR:Wa,EV_UNLINK_DIR:Ua,EV_RAW:qa,EV_ERROR:ks,STR_CLOSE:Ga,STR_END:za,BACK_SLASH_RE:Va,DOUBLE_SLASH_RE:Ir,SLASH_OR_BACK_SLASH_RE:Ka,DOT_RE:Ya,REPLACER_RE:Qa,SLASH:xs,SLASH_SLASH:Xa,BRACE_START:Za,BANG:Es,ONE_DOT:Lr,TWO_DOTS:Ja,GLOBSTAR:ec,SLASH_GLOBSTAR:Cs,ANYMATCH_OPTS:Ps,STRING_TYPE:Ms,FUNCTION_TYPE:tc,EMPTY_STR:Ss,EMPTY_FN:sc,isWindows:nc,isMacos:rc,isIBMi:oc}=yt(),ic=Hr(Is.stat),ac=Hr(Is.readdir),As=(s=[])=>Array.isArray(s)?s:[s],Nr=(s,e=[])=>(s.forEach(t=>{Array.isArray(t)?Nr(t,e):e.push(t)}),e),Mr=s=>{let e=Nr(As(s));if(!e.every(t=>typeof t===Ms))throw new TypeError(`Non-string provided as watch path: ${e}`);return e.map(Or)},Dr=s=>{let e=s.replace(Va,xs),t=!1;for(e.startsWith(Xa)&&(t=!0);e.match(Ir);)e=e.replace(Ir,xs);return t&&(e=xs+e),e},Or=s=>Dr(N.normalize(Dr(s))),Fr=(s=Ss)=>e=>typeof e!==Ms?e:Or(N.isAbsolute(e)?e:N.join(s,e)),cc=(s,e)=>N.isAbsolute(s)?s:s.startsWith(Es)?Es+N.join(e,s.slice(1)):N.join(e,s),pe=(s,e)=>s[e]===void 0,Ts=class{constructor(e,t){this.path=e,this._removeWatcher=t,this.items=new Set}add(e){let{items:t}=this;t&&e!==Lr&&e!==Ja&&t.add(e)}async remove(e){let{items:t}=this;if(!t||(t.delete(e),t.size>0))return;let n=this.path;try{await ac(n)}catch{this._removeWatcher&&this._removeWatcher(N.dirname(n),N.basename(n))}}has(e){let{items:t}=this;if(t)return t.has(e)}getChildren(){let{items:e}=this;if(e)return[...e.values()]}dispose(){this.items.clear(),delete this.path,delete this._removeWatcher,delete this.items,Object.freeze(this)}},lc="stat",dc="lstat",$s=class{constructor(e,t,n,r){this.fsw=r,this.path=e=e.replace(Qa,Ss),this.watchPath=t,this.fullWatchPath=N.resolve(t),this.hasGlob=t!==e,e===Ss&&(this.hasGlob=!1),this.globSymlink=this.hasGlob&&n?void 0:!1,this.globFilter=this.hasGlob?Rs(e,void 0,Ps):!1,this.dirParts=this.getDirParts(e),this.dirParts.forEach(i=>{i.length>1&&i.pop()}),this.followSymlinks=n,this.statMethod=n?lc:dc}checkGlobSymlink(e){return this.globSymlink===void 0&&(this.globSymlink=e.fullParentDir===this.fullWatchPath?!1:{realPath:e.fullParentDir,linkPath:this.fullWatchPath}),this.globSymlink?e.fullPath.replace(this.globSymlink.realPath,this.globSymlink.linkPath):e.fullPath}entryPath(e){return N.join(this.watchPath,N.relative(this.watchPath,this.checkGlobSymlink(e)))}filterPath(e){let{stats:t}=e;if(t&&t.isSymbolicLink())return this.filterDir(e);let n=this.entryPath(e);return(this.hasGlob&&typeof this.globFilter===tc?this.globFilter(n):!0)&&this.fsw._isntIgnored(n,t)&&this.fsw._hasReadPermissions(t)}getDirParts(e){if(!this.hasGlob)return[];let t=[];return(e.includes(Za)?Na.expand(e):[e]).forEach(r=>{t.push(N.relative(this.watchPath,r).split(Ka))}),t}filterDir(e){if(this.hasGlob){let t=this.getDirParts(this.checkGlobSymlink(e)),n=!1;this.unmatchedGlob=!this.dirParts.some(r=>r.every((i,o)=>(i===ec&&(n=!0),n||!t[0][o]||Rs(i,t[0][o],Ps))))}return!this.unmatchedGlob&&this.fsw._isntIgnored(this.entryPath(e),e.stats)}},Et=class extends Fa{constructor(e){super();let t={};e&&Object.assign(t,e),this._watched=new Map,this._closers=new Map,this._ignoredPaths=new Set,this._throttled=new Map,this._symlinkPaths=new Map,this._streams=new Set,this.closed=!1,pe(t,"persistent")&&(t.persistent=!0),pe(t,"ignoreInitial")&&(t.ignoreInitial=!1),pe(t,"ignorePermissionErrors")&&(t.ignorePermissionErrors=!1),pe(t,"interval")&&(t.interval=100),pe(t,"binaryInterval")&&(t.binaryInterval=300),pe(t,"disableGlobbing")&&(t.disableGlobbing=!1),t.enableBinaryInterval=t.binaryInterval!==t.interval,pe(t,"useFsEvents")&&(t.useFsEvents=!t.usePolling),Tr.canUse()||(t.useFsEvents=!1),pe(t,"usePolling")&&!t.useFsEvents&&(t.usePolling=rc),oc&&(t.usePolling=!0);let r=process.env.CHOKIDAR_USEPOLLING;if(r!==void 0){let c=r.toLowerCase();c==="false"||c==="0"?t.usePolling=!1:c==="true"||c==="1"?t.usePolling=!0:t.usePolling=!!c}let i=process.env.CHOKIDAR_INTERVAL;i&&(t.interval=Number.parseInt(i,10)),pe(t,"atomic")&&(t.atomic=!t.usePolling&&!t.useFsEvents),t.atomic&&(this._pendingUnlinks=new Map),pe(t,"followSymlinks")&&(t.followSymlinks=!0),pe(t,"awaitWriteFinish")&&(t.awaitWriteFinish=!1),t.awaitWriteFinish===!0&&(t.awaitWriteFinish={});let o=t.awaitWriteFinish;o&&(o.stabilityThreshold||(o.stabilityThreshold=2e3),o.pollInterval||(o.pollInterval=100),this._pendingWrites=new Map),t.ignored&&(t.ignored=As(t.ignored));let a=0;this._emitReady=()=>{a++,a>=this._readyCount&&(this._emitReady=sc,this._readyEmitted=!0,process.nextTick(()=>this.emit(ja)))},this._emitRaw=(...c)=>this.emit(qa,...c),this._readyEmitted=!1,this.options=t,t.useFsEvents?this._fsEventsHandler=new Tr(this):this._nodeFsHandler=new Ba(this),Object.freeze(t)}add(e,t,n){let{cwd:r,disableGlobbing:i}=this.options;this.closed=!1;let o=Mr(e);return r&&(o=o.map(a=>{let c=cc(a,r);return i||!_s(a)?c:Oa(c)})),o=o.filter(a=>a.startsWith(Es)?(this._ignoredPaths.add(a.slice(1)),!1):(this._ignoredPaths.delete(a),this._ignoredPaths.delete(a+Cs),this._userIgnored=void 0,!0)),this.options.useFsEvents&&this._fsEventsHandler?(this._readyCount||(this._readyCount=o.length),this.options.persistent&&(this._readyCount+=o.length),o.forEach(a=>this._fsEventsHandler._addToFsEvents(a))):(this._readyCount||(this._readyCount=0),this._readyCount+=o.length,Promise.all(o.map(async a=>{let c=await this._nodeFsHandler._addToNodeFs(a,!n,0,0,t);return c&&this._emitReady(),c})).then(a=>{this.closed||a.filter(c=>c).forEach(c=>{this.add(N.dirname(c),N.basename(t||c))})})),this}unwatch(e){if(this.closed)return this;let t=Mr(e),{cwd:n}=this.options;return t.forEach(r=>{!N.isAbsolute(r)&&!this._closers.has(r)&&(n&&(r=N.join(n,r)),r=N.resolve(r)),this._closePath(r),this._ignoredPaths.add(r),this._watched.has(r)&&this._ignoredPaths.add(r+Cs),this._userIgnored=void 0}),this}close(){if(this.closed)return this._closePromise;this.closed=!0,this.removeAllListeners();let e=[];return this._closers.forEach(t=>t.forEach(n=>{let r=n();r instanceof Promise&&e.push(r)})),this._streams.forEach(t=>t.destroy()),this._userIgnored=void 0,this._readyCount=0,this._readyEmitted=!1,this._watched.forEach(t=>t.dispose()),["closers","watched","streams","symlinkPaths","throttled"].forEach(t=>{this[`_${t}`].clear()}),this._closePromise=e.length?Promise.all(e).then(()=>{}):Promise.resolve(),this._closePromise}getWatched(){let e={};return this._watched.forEach((t,n)=>{let r=this.options.cwd?N.relative(this.options.cwd,n):n;e[r||Lr]=t.getChildren().sort()}),e}emitWithAll(e,t){this.emit(...t),e!==ks&&this.emit(bs,...t)}async _emit(e,t,n,r,i){if(this.closed)return;let o=this.options;nc&&(t=N.normalize(t)),o.cwd&&(t=N.relative(o.cwd,t));let a=[e,t];i!==void 0?a.push(n,r,i):r!==void 0?a.push(n,r):n!==void 0&&a.push(n);let c=o.awaitWriteFinish,d;if(c&&(d=this._pendingWrites.get(t)))return d.lastChange=new Date,this;if(o.atomic){if(e===$r)return this._pendingUnlinks.set(t,a),setTimeout(()=>{this._pendingUnlinks.forEach((u,p)=>{this.emit(...u),this.emit(bs,...u),this._pendingUnlinks.delete(p)})},typeof o.atomic=="number"?o.atomic:100),this;e===Rt&&this._pendingUnlinks.has(t)&&(e=a[0]=ze,this._pendingUnlinks.delete(t))}if(c&&(e===Rt||e===ze)&&this._readyEmitted){let u=(p,l)=>{p?(e=a[0]=ks,a[1]=p,this.emitWithAll(e,a)):l&&(a.length>2?a[2]=l:a.push(l),this.emitWithAll(e,a))};return this._awaitWriteFinish(t,c.stabilityThreshold,e,u),this}if(e===ze&&!this._throttle(ze,t,50))return this;if(o.alwaysStat&&n===void 0&&(e===Rt||e===Wa||e===ze)){let u=o.cwd?N.join(o.cwd,t):t,p;try{p=await ic(u)}catch{}if(!p||this.closed)return;a.push(p)}return this.emitWithAll(e,a),this}_handleError(e){let t=e&&e.code;return e&&t!=="ENOENT"&&t!=="ENOTDIR"&&(!this.options.ignorePermissionErrors||t!=="EPERM"&&t!=="EACCES")&&this.emit(ks,e),e||this.closed}_throttle(e,t,n){this._throttled.has(e)||this._throttled.set(e,new Map);let r=this._throttled.get(e),i=r.get(t);if(i)return i.count++,!1;let o,a=()=>{let d=r.get(t),u=d?d.count:0;return r.delete(t),clearTimeout(o),d&&clearTimeout(d.timeoutObject),u};o=setTimeout(a,n);let c={timeoutObject:o,clear:a,count:0};return r.set(t,c),c}_incrReadyCount(){return this._readyCount++}_awaitWriteFinish(e,t,n,r){let i,o=e;this.options.cwd&&!N.isAbsolute(e)&&(o=N.join(this.options.cwd,e));let a=new Date,c=d=>{Is.stat(o,(u,p)=>{if(u||!this._pendingWrites.has(e)){u&&u.code!=="ENOENT"&&r(u);return}let l=Number(new Date);d&&p.size!==d.size&&(this._pendingWrites.get(e).lastChange=l);let f=this._pendingWrites.get(e);l-f.lastChange>=t?(this._pendingWrites.delete(e),r(void 0,p)):i=setTimeout(c,this.options.awaitWriteFinish.pollInterval,p)})};this._pendingWrites.has(e)||(this._pendingWrites.set(e,{lastChange:a,cancelWait:()=>(this._pendingWrites.delete(e),clearTimeout(i),n)}),i=setTimeout(c,this.options.awaitWriteFinish.pollInterval))}_getGlobIgnored(){return[...this._ignoredPaths.values()]}_isIgnored(e,t){if(this.options.atomic&&Ya.test(e))return!0;if(!this._userIgnored){let{cwd:n}=this.options,r=this.options.ignored,i=r&&r.map(Fr(n)),o=As(i).filter(c=>typeof c===Ms&&!_s(c)).map(c=>c+Cs),a=this._getGlobIgnored().map(Fr(n)).concat(i,o);this._userIgnored=Rs(a,void 0,Ps)}return this._userIgnored([e,t])}_isntIgnored(e,t){return!this._isIgnored(e,t)}_getWatchHelpers(e,t){let n=t||this.options.disableGlobbing||!_s(e)?e:La(e),r=this.options.followSymlinks;return new $s(e,n,r,this)}_getWatchedDir(e){this._boundRemove||(this._boundRemove=this._remove.bind(this));let t=N.resolve(e);return this._watched.has(t)||this._watched.set(t,new Ts(t,this._boundRemove)),this._watched.get(t)}_hasReadPermissions(e){if(this.options.ignorePermissionErrors)return!0;let n=(e&&Number.parseInt(e.mode,10))&511;return!!(4&Number.parseInt(n.toString(8)[0],10))}_remove(e,t,n){let r=N.join(e,t),i=N.resolve(r);if(n=n??(this._watched.has(r)||this._watched.has(i)),!this._throttle("remove",r,100))return;!n&&!this.options.useFsEvents&&this._watched.size===1&&this.add(e,t,!0),this._getWatchedDir(r).getChildren().forEach(l=>this._remove(r,l));let c=this._getWatchedDir(e),d=c.has(t);c.remove(t),this._symlinkPaths.has(i)&&this._symlinkPaths.delete(i);let u=r;if(this.options.cwd&&(u=N.relative(this.options.cwd,r)),this.options.awaitWriteFinish&&this._pendingWrites.has(u)&&this._pendingWrites.get(u).cancelWait()===Rt)return;this._watched.delete(r),this._watched.delete(i);let p=n?Ua:$r;d&&!this._isIgnored(r)&&this._emit(p,r),this.options.useFsEvents||this._closePath(r)}_closePath(e){this._closeFile(e);let t=N.dirname(e);this._getWatchedDir(t).remove(N.basename(e))}_closeFile(e){let t=this._closers.get(e);t&&(t.forEach(n=>n()),this._closers.delete(e))}_addPathCloser(e,t){if(!t)return;let n=this._closers.get(e);n||(n=[],this._closers.set(e,n)),n.push(t)}_readdirp(e,t){if(this.closed)return;let n={type:bs,alwaysStat:!0,lstat:!0,...t},r=Ha(e,n);return this._streams.add(r),r.once(Ga,()=>{r=void 0}),r.once(za,()=>{r&&(this._streams.delete(r),r=void 0)}),r}};Ds.FSWatcher=Et;var uc=(s,e)=>{let t=new Et(e);return t.add(s),t};Ds.watch=uc});var wc={};Jr(wc,{activate:()=>fc,deactivate:()=>gc});module.exports=eo(wc);var h=z(require("vscode"));var V=z(require("vscode")),Ws=z(require("crypto")),it=z(require("path"));function js(s,...e){return V.workspace.getConfiguration("projectMemory").get("showNotifications",!0)?V.window.showInformationMessage(s,...e):Promise.resolve(void 0)}var ot=class{constructor(e,t,n){this._extensionUri=e;this._dataRoot=t,this._agentsRoot=n}static viewType="projectMemory.dashboardView";_view;_dataRoot;_agentsRoot;_disposables=[];dispose(){for(;this._disposables.length;){let e=this._disposables.pop();e&&e.dispose()}}getWorkspaceId(){let e=V.workspace.workspaceFolders?.[0];if(!e)return null;let t=e.uri.fsPath,n=it.normalize(t).toLowerCase(),r=Ws.createHash("sha256").update(n).digest("hex").substring(0,12);return`${it.basename(t).replace(/[^a-zA-Z0-9-_]/g,"-")}-${r}`}resolveWebviewView(e,t,n){this.dispose(),this._view=e,e.webview.options={enableScripts:!0,localResourceRoots:[V.Uri.joinPath(this._extensionUri,"webview","dist"),V.Uri.joinPath(this._extensionUri,"resources")]},e.webview.html=this._getHtmlForWebview(e.webview),this._disposables.push(e.onDidDispose(()=>{this._view=void 0})),this._disposables.push(e.webview.onDidReceiveMessage(async r=>{switch(console.log("Received message from webview:",r),r.type){case"openFile":let{filePath:i,line:o}=r.data;V.commands.executeCommand("projectMemory.openFile",i,o);break;case"runCommand":let{command:a}=r.data;console.log("Executing command:",a);try{await V.commands.executeCommand(a),console.log("Command executed successfully")}catch(x){console.error("Command execution failed:",x),V.window.showErrorMessage(`Command failed: ${x}`)}break;case"openExternal":let{url:c}=r.data;console.log("Opening dashboard panel:",c),V.commands.executeCommand("projectMemory.openDashboardPanel",c);break;case"openPlan":let{planId:d,workspaceId:u}=r.data,p=`http://localhost:5173/workspace/${u}/plan/${d}`;console.log("Opening plan:",p),V.commands.executeCommand("projectMemory.openDashboardPanel",p);break;case"copyToClipboard":let{text:l}=r.data;await V.env.clipboard.writeText(l),js(`Copied to clipboard: ${l}`);break;case"showNotification":let{level:f,text:v}=r.data;f==="error"?V.window.showErrorMessage(v):f==="warning"?V.window.showWarningMessage(v):js(v);break;case"revealInExplorer":let{path:y}=r.data;V.commands.executeCommand("revealInExplorer",V.Uri.file(y));break;case"getConfig":this.postMessage({type:"config",data:{dataRoot:this._dataRoot,agentsRoot:this._agentsRoot,workspaceFolders:V.workspace.workspaceFolders?.map(x=>({name:x.name,path:x.uri.fsPath}))||[]}});break;case"ready":this.postMessage({type:"init",data:{dataRoot:this._dataRoot,agentsRoot:this._agentsRoot}});break}}))}postMessage(e){this._view&&this._view.webview.postMessage(e)}updateConfig(e,t){this._dataRoot=e,this._agentsRoot=t,this.postMessage({type:"configUpdated",data:{dataRoot:e,agentsRoot:t}})}_getHtmlForWebview(e){let t=to(),n=V.workspace.getConfiguration("projectMemory"),r=n.get("serverPort")||n.get("apiPort")||3001,i="http://localhost:5173",o=this.getWorkspaceId()||"",a=V.workspace.workspaceFolders?.[0]?.name||"No workspace",c={dashboard:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>',knowledgeBase:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6.5 15.5H20"/></svg>',contextFiles:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>',contextFilesGrid:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="M3 15h6"/><path d="M15 3v18"/><path d="M15 9h6"/></svg>',agents:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/></svg>',syncHistory:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/></svg>',diagnostics:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',newTemplate:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="M12 5v14"/></svg>',resumePlan:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 3l14 9-14 9V3z"/></svg>',archive:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>',addContextNote:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3z"/><path d="M15 3v6h6"/><path d="M9 18h6"/><path d="M10 14h4"/></svg>',researchNote:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/><path d="M15 12h-9"/></svg>',createNewPlan:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v4"/><circle cx="18" cy="18" r="3"/><path d="M18 15v6"/><path d="M15 18h6"/></svg>',deployAgents:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v9"/><path d="m16 11 3-3 3 3"/></svg>',deployInstructions:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6.5 15.5H20"/><path d="M14 11V7"/><path d="m11 10 3-3 3 3"/></svg>',deployPrompts:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 11 2-2-2-2"/><path d="M11 9h4"/><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M12 15v4"/><path d="m9 18 3-3 3 3"/></svg>',configureDefaults:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/><path d="m9 12 2 2 4-4"/></svg>',deployAllDefaults:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14"/><path d="M16.5 9.4 7.55 4.24"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/><path d="M17 13h5"/><path d="M17 17h5"/><path d="M17 21h5"/></svg>',handoffEvent:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m16 13 4 4-4 4"/><path d="M20 17H4a2 2 0 0 1-2-2V5"/></svg>',noteEvent:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',stepUpdate:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',searchBox:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',buildScript:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',runButton:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>',stopStale:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="10" height="10" x="7" y="7" rx="2"/></svg>',healthBadge:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',dataRoot:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="3" y2="15"/></svg>',agentHandoff:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></svg>'},d=JSON.stringify(c);return`<!DOCTYPE html>
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
            grid-template-columns: repeat(6, 1fr);
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
            font-size: 12px;
            font-weight: 600;
            margin-bottom: 8px;
        }
        .plans-widget {
            background: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 6px;
            margin: 8px 16px;
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
            font-size: 13px;
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
        @media (max-width: 360px) {
            .icon-grid { grid-template-columns: repeat(4, 1fr); }
        }
        
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
        .info-card h3 { font-size: 13px; margin-bottom: 8px; }
        .info-card ul { list-style: none; font-size: 12px; }
        .info-card li { padding: 4px 0; display: flex; gap: 8px; }
        .info-card .label { color: var(--vscode-descriptionForeground); min-width: 80px; }
        
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
            padding: 12px 16px;
            cursor: pointer;
            user-select: none;
            gap: 8px;
        }
        .collapsible-header:hover {
            background: var(--vscode-list-hoverBackground);
        }
        .collapsible-header h3 { font-size: 13px; flex: 1; }
        .collapsible-header .count {
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 2px 8px;
            border-radius: 10px;
            font-size: 11px;
        }
        .collapsible-header .chevron {
            transition: transform 0.2s;
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
        <h2>\u{1F9E0} Project Memory</h2>
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
        const apiPort = ${r};
        const dashboardUrl = '${i}';
        const workspaceId = '${o}';
        const workspaceName = '${a}';
        const icons = ${d};
        
        let activePlans = [];
        let archivedPlans = [];
        let currentPlanTab = 'active';
        let recentEvents = [];
        
        // Listen for messages from the extension
        window.addEventListener('message', function(event) {
            const message = event.data;
            if (message.type === 'deploymentComplete') {
                const { type, count, targetDir } = message.data;
                showToast('\u2705 Deployed ' + count + ' ' + type + ' to workspace', 'success');
            } else if (message.type === 'deploymentError') {
                showToast('\u274C ' + message.data.error, 'error');
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
            
            if (action === 'open-browser') {
                vscode.postMessage({ type: 'openExternal', data: { url: dashboardUrl } });
            } else if (action === 'refresh') {
                const statusDot = document.getElementById('statusDot');
                statusDot.className = 'status-dot loading';
                checkServer();
            } else if (action === 'run-command' && command) {
                vscode.postMessage({ type: 'runCommand', data: { command: command } });
            } else if (action === 'open-plan' && planId) {
                vscode.postMessage({ type: 'openPlan', data: { planId: planId, workspaceId: workspaceId } });
            } else if (action === 'copy' && copyText) {
                vscode.postMessage({ type: 'copyToClipboard', data: { text: copyText } });
            }
        });
        
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
                                <span>\u2022</span>
                                <span>\${plan.progress?.done || 0}/\${plan.progress?.total || 0} steps</span>
                            </div>
                        </div>
                        <span class="plan-status \${plan.status}">\${plan.status}</span>
                        <div class="plan-actions">
                            <button class="btn btn-small btn-secondary" data-action="copy" data-copy="\${planId}" title="Copy plan ID">\u{1F4CB}</button>
                            <button class="btn btn-small" data-action="open-plan" data-plan-id="\${planId}" title="Open plan">\u2192</button>
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
                    activePlans = (data.plans || []).filter(p => p.status === 'active');
                    archivedPlans = (data.plans || []).filter(p => p.status === 'archived');
                    updatePlanLists();
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
        
        async function checkServer() {
            const statusDot = document.getElementById('statusDot');
            const statusText = document.getElementById('statusText');
            const content = document.getElementById('content');
            const fallback = document.getElementById('fallback');
            
            try {
                const response = await fetch('http://localhost:' + apiPort + '/api/health');
                if (response.ok) {
                    const data = await response.json();
                    statusDot.className = 'status-dot';
                    statusText.textContent = 'Connected';
                    
                    // Show dashboard info with plan lists
                    fallback.innerHTML = \`
                        <div class="info-card">
                            <h3>\u{1F4CA} Server Status</h3>
                            <ul>
                                <li><span class="label">Status:</span> <span>\u2713 Running</span></li>
                                <li><span class="label">API Port:</span> <span>${r}</span></li>
                                <li><span class="label">Workspace:</span> <span>${a}</span></li>
                            </ul>
                        </div>
                        <div class="info-card">
                            <div class="icon-row-title">Quick Actions</div>
                            <div class="icon-grid">
                                <button class="icon-btn" data-action="open-browser" title="Open Full Dashboard">
                                    ${c.dashboard}
                                </button>
                                <button class="icon-btn" data-action="refresh" title="Refresh Status">
                                    ${c.syncHistory}
                                </button>
                                <button class="icon-btn" data-action="run-command" data-command="projectMemory.createPlan" title="Create New Plan">
                                    ${c.createNewPlan}
                                </button>
                                <button class="icon-btn" data-action="run-command" data-command="projectMemory.deployAgents" title="Deploy Agents">
                                    ${c.deployAgents}
                                </button>
                                <button class="icon-btn" data-action="run-command" data-command="projectMemory.deployInstructions" title="Deploy Instructions">
                                    ${c.deployInstructions}
                                </button>
                                <button class="icon-btn" data-action="run-command" data-command="projectMemory.deployPrompts" title="Deploy Prompts">
                                    ${c.deployPrompts}
                                </button>
                            </div>
                        </div>

                        <div class="info-card">
                            <div class="icon-row-title">Configuration</div>
                            <div class="icon-grid">
                                <button class="icon-btn" data-action="run-command" data-command="projectMemory.openSettings" title="Configure Defaults">
                                    ${c.configureDefaults}
                                </button>
                                <button class="icon-btn" data-action="run-command" data-command="projectMemory.deployDefaults" title="Deploy All Defaults">
                                    ${c.deployAllDefaults}
                                </button>
                            </div>
                        </div>

                        <div class="info-card">
                            <div class="icon-row-title">Context</div>
                            <div class="icon-grid">
                                <button class="icon-btn" data-action="open-browser" title="Add Context Note">
                                    ${c.addContextNote}
                                </button>
                                <button class="icon-btn" data-action="open-browser" title="Add Research Note">
                                    ${c.researchNote}
                                </button>
                                <button class="icon-btn" data-action="open-browser" title="View Context Files">
                                    ${c.contextFilesGrid}
                                </button>
                            </div>
                        </div>

                        <div class="info-card">
                            <div class="icon-row-title">Plan Shortcuts</div>
                            <div class="icon-grid">
                                <button class="icon-btn" data-action="open-browser" title="Resume Plan">
                                    ${c.resumePlan}
                                </button>
                                <button class="icon-btn" data-action="open-browser" title="Archive Plan">
                                    ${c.archive}
                                </button>
                            </div>
                        </div>

                        <div class="plans-widget">
                            <div class="plans-header">
                                <h3>\u{1F4CB} Plans</h3>
                                <span class="label">Tabs</span>
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

                        <div class="info-card">
                            <div class="icon-row-title">Recent Activity</div>
                            <div class="activity-list" id="activityList">
                                <div class="empty-state">Loading activity...</div>
                            </div>
                        </div>

                        <div class="info-card">
                            <div class="icon-row-title">Build, Health & System</div>
                            <div class="icon-grid">
                                <button class="icon-btn" data-action="open-browser" title="Build Scripts">
                                    ${c.buildScript}
                                </button>
                                <button class="icon-btn" data-action="open-browser" title="Run Script">
                                    ${c.runButton}
                                </button>
                                <button class="icon-btn" data-action="open-browser" title="Stale/Stop Status">
                                    ${c.stopStale}
                                </button>
                                <button class="icon-btn" data-action="open-browser" title="Workspace Health">
                                    ${c.healthBadge}
                                </button>
                                <button class="icon-btn" data-action="open-browser" title="Data Root">
                                    ${c.dataRoot}
                                </button>
                                <button class="icon-btn" data-action="open-browser" title="Agent Handoff">
                                    ${c.agentHandoff}
                                </button>
                            </div>
                        </div>

                        <div class="info-card">
                            <div class="icon-row-title">Search</div>
                            <div class="icon-grid">
                                <button class="icon-btn" data-action="open-browser" title="Open Search">
                                    ${c.searchBox}
                                </button>
                            </div>
                        </div>
                    \`;
                    
                    // Fetch plans after rendering
                    fetchPlans();
                    fetchEvents();
                } else {
                    throw new Error('Server returned ' + response.status);
                }
            } catch (error) {
                statusDot.className = 'status-dot error';
                statusText.textContent = 'Disconnected';
                fallback.innerHTML = \`
                    <p>Dashboard server is not running</p>
                    <button class="btn" data-action="run-command" data-command="projectMemory.startServer">Start Server</button>
                    <button class="btn btn-secondary" data-action="refresh">Retry</button>
                    <div class="info-card" style="margin-top: 20px;">
                        <h3>\u{1F4A1} Troubleshooting</h3>
                        <ul>
                            <li>Check if port \${apiPort} is available</li>
                            <li>View server logs for errors</li>
                            <li>Try restarting the server</li>
                        </ul>
                        <button class="btn btn-secondary" style="margin-top: 12px" data-action="run-command" data-command="projectMemory.showServerLogs">Show Server Logs</button>
                    </div>
                \`;
            }
        }
        
        // Initial check
        checkServer();
        
        // Periodic check every 30 seconds (reduced from 10 for performance)
        setInterval(checkServer, 30000);
        
        // Signal ready
        vscode.postMessage({ type: 'ready' });
    </script>
</body>
</html>`}};function to(){let s="",e="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";for(let t=0;t<32;t++)s+=e.charAt(Math.floor(Math.random()*e.length));return s}var $e=z(require("vscode")),Br=z(Fs()),Ve=z(require("path"));function Hs(s,...e){return $e.workspace.getConfiguration("projectMemory").get("showNotifications",!0)?$e.window.showInformationMessage(s,...e):Promise.resolve(void 0)}var Pt=class{watcher=null;agentsRoot;autoDeploy;constructor(e,t){this.agentsRoot=e,this.autoDeploy=t}start(){if(this.watcher)return;let e=Ve.join(this.agentsRoot,"*.agent.md");this.watcher=Br.watch(e,{persistent:!0,ignoreInitial:!0}),this.watcher.on("change",async t=>{let n=Ve.basename(t,".agent.md");this.autoDeploy?Hs(`Deploying updated agent: ${n}`):await Hs(`Agent template updated: ${n}`,"Deploy to All Workspaces","Ignore")==="Deploy to All Workspaces"&&$e.commands.executeCommand("projectMemory.deployAgents")}),this.watcher.on("add",t=>{let n=Ve.basename(t,".agent.md");Hs(`New agent template detected: ${n}`)}),console.log(`Agent watcher started for: ${e}`)}stop(){this.watcher&&(this.watcher.close(),this.watcher=null,console.log("Agent watcher stopped"))}setAutoDeploy(e){this.autoDeploy=e}};var xe=z(require("vscode")),jr=z(Fs()),At=z(require("path"));function Ls(s,...e){return xe.workspace.getConfiguration("projectMemory").get("showNotifications",!0)?xe.window.showInformationMessage(s,...e):Promise.resolve(void 0)}var St=class{watchers=new Map;config;onFileChange;constructor(e){this.config=e}start(){this.config.agentsRoot&&this.startWatcher("agent",this.config.agentsRoot,"*.agent.md"),this.config.promptsRoot&&this.startWatcher("prompt",this.config.promptsRoot,"*.prompt.md"),this.config.instructionsRoot&&this.startWatcher("instruction",this.config.instructionsRoot,"*.instructions.md")}startWatcher(e,t,n){if(this.watchers.has(e))return;let r=At.join(t,n),i=jr.watch(r,{persistent:!0,ignoreInitial:!0});i.on("change",async o=>{this.handleFileEvent(e,o,"change")}),i.on("add",o=>{this.handleFileEvent(e,o,"add")}),i.on("unlink",o=>{this.handleFileEvent(e,o,"unlink")}),this.watchers.set(e,i),console.log(`${e} watcher started for: ${r}`)}async handleFileEvent(e,t,n){let r=At.basename(t),o={agent:"Agent template",prompt:"Prompt file",instruction:"Instruction file"}[e];if(this.onFileChange&&this.onFileChange(e,t,n),n==="unlink"){xe.window.showWarningMessage(`${o} deleted: ${r}`);return}if(n==="add"){Ls(`New ${o.toLowerCase()} detected: ${r}`);return}this.config.autoDeploy?(Ls(`Auto-deploying updated ${o.toLowerCase()}: ${r}`),this.triggerDeploy(e)):await Ls(`${o} updated: ${r}`,"Deploy to All Workspaces","Ignore")==="Deploy to All Workspaces"&&this.triggerDeploy(e)}triggerDeploy(e){let t={agent:"projectMemory.deployAgents",prompt:"projectMemory.deployPrompts",instruction:"projectMemory.deployInstructions"};xe.commands.executeCommand(t[e])}stop(){for(let[e,t]of this.watchers)t.close(),console.log(`${e} watcher stopped`);this.watchers.clear()}updateConfig(e){this.stop(),this.config={...this.config,...e},this.start()}setAutoDeploy(e){this.config.autoDeploy=e}onFileChanged(e){this.onFileChange=e}getWatchedPaths(){let e=[];return this.config.agentsRoot&&e.push({type:"agent",path:this.config.agentsRoot}),this.config.promptsRoot&&e.push({type:"prompt",path:this.config.promptsRoot}),this.config.instructionsRoot&&e.push({type:"instruction",path:this.config.instructionsRoot}),e}};var $t=z(require("vscode")),Tt=class{statusBarItem;currentAgent=null;currentPlan=null;constructor(){this.statusBarItem=$t.window.createStatusBarItem($t.StatusBarAlignment.Left,100),this.statusBarItem.command="projectMemory.showDashboard",this.updateDisplay(),this.statusBarItem.show()}setCurrentAgent(e){this.currentAgent=e,this.updateDisplay()}setCurrentPlan(e){this.currentPlan=e,this.updateDisplay()}updateDisplay(){this.currentAgent&&this.currentPlan?(this.statusBarItem.text=`$(robot) ${this.currentAgent} \xB7 ${this.currentPlan}`,this.statusBarItem.tooltip=`Project Memory: ${this.currentAgent} working on "${this.currentPlan}"`):this.currentAgent?(this.statusBarItem.text=`$(robot) ${this.currentAgent}`,this.statusBarItem.tooltip=`Project Memory: ${this.currentAgent} active`):(this.statusBarItem.text="$(robot) Project Memory",this.statusBarItem.tooltip="Click to open Project Memory Dashboard")}showTemporaryMessage(e,t=3e3){let n=this.statusBarItem.text,r=this.statusBarItem.tooltip;this.statusBarItem.text=`$(sync~spin) ${e}`,this.statusBarItem.tooltip=e,setTimeout(()=>{this.statusBarItem.text=n,this.statusBarItem.tooltip=r},t)}setCopilotStatus(e){e.agents+e.prompts+e.instructions>0?(this.statusBarItem.text=`$(robot) PM (${e.agents}A/${e.prompts}P/${e.instructions}I)`,this.statusBarItem.tooltip=`Project Memory
Agents: ${e.agents}
Prompts: ${e.prompts}
Instructions: ${e.instructions}`):this.updateDisplay()}dispose(){this.statusBarItem.dispose()}};var ee=z(require("vscode")),Ke=require("child_process"),me=z(require("path")),Ns=z(require("http"));function pc(s,...e){return ee.workspace.getConfiguration("projectMemory").get("showNotifications",!0)?ee.window.showInformationMessage(s,...e):Promise.resolve(void 0)}var It=class{serverProcess=null;frontendProcess=null;outputChannel;statusBarItem;_isRunning=!1;_isFrontendRunning=!1;_isExternalServer=!1;_isExternalFrontend=!1;config;restartAttempts=0;maxRestartAttempts=3;_performanceStats={apiCalls:0,avgResponseTime:0,lastCheck:Date.now()};constructor(e){this.config=e,this.outputChannel=ee.window.createOutputChannel("Project Memory Server"),this.statusBarItem=ee.window.createStatusBarItem(ee.StatusBarAlignment.Right,100),this.statusBarItem.command="projectMemory.toggleServer"}get isRunning(){return this._isRunning}get isFrontendRunning(){return this._isFrontendRunning}get isExternalServer(){return this._isExternalServer}get performanceStats(){return{...this._performanceStats}}async start(){if(this._isRunning)return this.log("Server is already running"),!0;let e=this.config.serverPort||3001;if(this.log(`Checking if server already exists on port ${e}...`),await this.checkHealth(e))return this.log("Found existing server - connecting without spawning new process"),this._isRunning=!0,this._isExternalServer=!0,this.restartAttempts=0,this.updateStatusBar("connected"),pc("Connected to existing Project Memory server"),!0;let n=this.getServerDirectory();if(!n)return this.log("Dashboard server directory not found"),!1;this.log(`Starting server from: ${n}`),this._isExternalServer=!1,this.updateStatusBar("starting");try{let r={...process.env,PORT:String(this.config.serverPort||3001),WS_PORT:String(this.config.wsPort||3002),MBS_DATA_ROOT:this.config.dataRoot,MBS_AGENTS_ROOT:this.config.agentsRoot,MBS_PROMPTS_ROOT:this.config.promptsRoot||"",MBS_INSTRUCTIONS_ROOT:this.config.instructionsRoot||""},i=me.join(n,"dist","index.js"),o,a;return require("fs").existsSync(i)?(o="node",a=[i]):(o=process.platform==="win32"?"npx.cmd":"npx",a=["tsx","src/index.ts"]),this.serverProcess=(0,Ke.spawn)(o,a,{cwd:n,env:r,shell:!0,windowsHide:!0}),this.serverProcess.stdout?.on("data",u=>{this.log(u.toString().trim())}),this.serverProcess.stderr?.on("data",u=>{this.log(`[stderr] ${u.toString().trim()}`)}),this.serverProcess.on("error",u=>{this.log(`Server error: ${u.message}`),this._isRunning=!1,this.updateStatusBar("error")}),this.serverProcess.on("exit",(u,p)=>{this.log(`Server exited with code ${u}, signal ${p}`),this._isRunning=!1,this.serverProcess=null,u!==0&&this.restartAttempts<this.maxRestartAttempts?(this.restartAttempts++,this.log(`Attempting restart (${this.restartAttempts}/${this.maxRestartAttempts})...`),setTimeout(()=>this.start(),2e3)):this.updateStatusBar("stopped")}),await this.waitForServer(1e4)?(this._isRunning=!0,this.restartAttempts=0,this.updateStatusBar("running"),this.log("Server started successfully"),!0):(this.log("Server failed to start within timeout"),this.stop(),!1)}catch(r){return this.log(`Failed to start server: ${r}`),this.updateStatusBar("error"),!1}}async stop(){if(this._isExternalServer){this.log("Disconnecting from external server (not stopping it)"),this._isRunning=!1,this._isExternalServer=!1,this.updateStatusBar("stopped");return}if(this.serverProcess)return this.log("Stopping server..."),this.updateStatusBar("stopping"),new Promise(e=>{if(!this.serverProcess){e();return}let t=setTimeout(()=>{this.serverProcess&&(this.log("Force killing server..."),this.serverProcess.kill("SIGKILL")),e()},5e3);this.serverProcess.on("exit",()=>{clearTimeout(t),this._isRunning=!1,this.serverProcess=null,this.updateStatusBar("stopped"),this.log("Server stopped"),e()}),process.platform==="win32"?(0,Ke.spawn)("taskkill",["/pid",String(this.serverProcess.pid),"/f","/t"],{windowsHide:!0}):this.serverProcess.kill("SIGTERM")})}async restart(){return await this.stop(),this.start()}async startFrontend(){if(this._isFrontendRunning)return this.log("Frontend is already running"),!0;if(await this.checkPort(5173))return this.log("Found existing frontend on port 5173 - using it"),this._isFrontendRunning=!0,this._isExternalFrontend=!0,!0;let t=this.getDashboardDirectory();if(!t)return this.log("Could not find dashboard directory for frontend"),!1;this.log(`Starting frontend from: ${t}`);try{let n=process.platform==="win32"?"npm.cmd":"npm",r=["run","dev"];return this.frontendProcess=(0,Ke.spawn)(n,r,{cwd:t,shell:!0,windowsHide:!0,env:{...process.env,VITE_API_URL:`http://localhost:${this.config.serverPort||3001}`}}),this.frontendProcess.stdout?.on("data",o=>{this.log(`[frontend] ${o.toString().trim()}`)}),this.frontendProcess.stderr?.on("data",o=>{this.log(`[frontend] ${o.toString().trim()}`)}),this.frontendProcess.on("error",o=>{this.log(`Frontend error: ${o.message}`),this._isFrontendRunning=!1}),this.frontendProcess.on("exit",(o,a)=>{this.log(`Frontend exited with code ${o}, signal ${a}`),this._isFrontendRunning=!1,this.frontendProcess=null}),await this.waitForPort(5173,15e3)?(this._isFrontendRunning=!0,this.log("Frontend started successfully on port 5173"),!0):(this.log("Frontend failed to start within timeout"),!1)}catch(n){return this.log(`Failed to start frontend: ${n}`),!1}}async stopFrontend(){if(this._isExternalFrontend){this.log("Disconnecting from external frontend (not stopping it)"),this._isFrontendRunning=!1,this._isExternalFrontend=!1;return}if(this.frontendProcess)return this.log("Stopping frontend..."),new Promise(e=>{if(!this.frontendProcess){e();return}let t=setTimeout(()=>{this.frontendProcess&&(this.log("Force killing frontend..."),this.frontendProcess.kill("SIGKILL")),e()},5e3);this.frontendProcess.on("exit",()=>{clearTimeout(t),this._isFrontendRunning=!1,this.frontendProcess=null,this.log("Frontend stopped"),e()}),process.platform==="win32"?(0,Ke.spawn)("taskkill",["/pid",String(this.frontendProcess.pid),"/f","/t"],{windowsHide:!0}):this.frontendProcess.kill("SIGTERM")})}getDashboardDirectory(){let e=ee.workspace.workspaceFolders?.[0]?.uri.fsPath,t=ee.extensions.getExtension("project-memory.project-memory-dashboard")?.extensionPath,n=[t?me.join(t,"dashboard"):null,"c:\\Users\\codi.f\\vscode_ModularAgenticProcedureSystem\\dashboard","c:\\Users\\User\\Project_Memory_MCP\\Project-Memory-MCP\\dashboard",e?me.join(e,"dashboard"):null,t?me.join(t,"..","dashboard"):null].filter(Boolean),r=require("fs");for(let i of n){let o=me.join(i,"package.json");if(r.existsSync(o))return this.log(`Found dashboard at: ${i}`),i}return this.log("Could not find dashboard directory for frontend"),null}async waitForPort(e,t){let n=Date.now();for(;Date.now()-n<t;){try{if(await this.checkPort(e))return!0}catch{}await new Promise(r=>setTimeout(r,500))}return!1}checkPort(e){return new Promise(t=>{let n=Ns.get(`http://localhost:${e}`,r=>{t(r.statusCode!==void 0)});n.on("error",()=>t(!1)),n.setTimeout(1e3,()=>{n.destroy(),t(!1)})})}updateConfig(e){this.config={...this.config,...e},this._isRunning&&this.restart()}getServerDirectory(){let e=ee.extensions.getExtension("project-memory.project-memory-dashboard")?.extensionPath,t=ee.workspace.workspaceFolders?.[0]?.uri.fsPath,n=[e?me.join(e,"server"):null,"c:\\Users\\codi.f\\vscode_ModularAgenticProcedureSystem\\dashboard\\server","c:\\Users\\User\\Project_Memory_MCP\\Project-Memory-MCP\\dashboard\\server",t?me.join(t,"dashboard","server"):null,e?me.join(e,"..","dashboard","server"):null].filter(Boolean),r=require("fs");for(let i of n){let o=me.join(i,"package.json");if(r.existsSync(o))return this.log(`Found server at: ${i}`),i}return null}hasServerDirectory(){return this.getServerDirectory()!==null}async waitForServer(e){let t=this.config.serverPort||3001,n=Date.now();for(;Date.now()-n<e;){try{if(await this.checkHealth(t))return!0}catch{}await new Promise(r=>setTimeout(r,500))}return!1}checkHealth(e){return new Promise(t=>{let n=Ns.get(`http://localhost:${e}/api/health`,r=>{t(r.statusCode===200)});n.on("error",()=>t(!1)),n.setTimeout(1e3,()=>{n.destroy(),t(!1)})})}updateStatusBar(e){let t={starting:"$(loading~spin)",running:"$(check)",connected:"$(plug)",stopping:"$(loading~spin)",stopped:"$(circle-slash)",error:"$(error)"},n={running:new ee.ThemeColor("statusBarItem.prominentBackground"),connected:new ee.ThemeColor("statusBarItem.prominentBackground"),error:new ee.ThemeColor("statusBarItem.errorBackground")},r={starting:"PM Server",running:"PM Server (local)",connected:"PM Server (shared)",stopping:"PM Server",stopped:"PM Server",error:"PM Server"};this.statusBarItem.text=`${t[e]} ${r[e]||"PM Server"}`,this.statusBarItem.tooltip=`Project Memory Server: ${e}${this._isExternalServer?" (connected to existing)":""}
Click to toggle`,this.statusBarItem.backgroundColor=n[e],this.statusBarItem.show()}async measureApiCall(e){let t=Date.now();try{let n=await e(),r=Date.now()-t;return this._performanceStats.apiCalls++,this._performanceStats.avgResponseTime=(this._performanceStats.avgResponseTime*(this._performanceStats.apiCalls-1)+r)/this._performanceStats.apiCalls,this._performanceStats.lastCheck=Date.now(),n}catch(n){throw n}}log(e){let t=new Date().toISOString();this.outputChannel.appendLine(`[${t}] ${e}`)}showLogs(){this.outputChannel.show()}dispose(){this.stop(),this.stopFrontend(),this.outputChannel.dispose(),this.statusBarItem.dispose()}};var Wr=z(require("vscode")),Q=z(require("fs")),te=z(require("path")),Mt=class{outputChannel;config;constructor(e){this.config=e,this.outputChannel=Wr.window.createOutputChannel("Project Memory Deployment")}updateConfig(e){this.config={...this.config,...e}}async deployToWorkspace(e){let t=[],n=[];this.log(`Deploying defaults to workspace: ${e}`);let r=te.join(e,".github","agents");for(let o of this.config.defaultAgents)try{await this.deployAgent(o,r)&&t.push(o)}catch(a){this.log(`Failed to deploy agent ${o}: ${a}`)}let i=te.join(e,".github","instructions");for(let o of this.config.defaultInstructions)try{await this.deployInstruction(o,i)&&n.push(o)}catch(a){this.log(`Failed to deploy instruction ${o}: ${a}`)}return this.log(`Deployed ${t.length} agents, ${n.length} instructions`),{agents:t,instructions:n}}async deployAgent(e,t){let n=te.join(this.config.agentsRoot,`${e}.agent.md`),r=te.join(t,`${e}.agent.md`);return this.copyFile(n,r)}async deployInstruction(e,t){let n=te.join(this.config.instructionsRoot,`${e}.instructions.md`),r=te.join(t,`${e}.instructions.md`);return this.copyFile(n,r)}async updateWorkspace(e){let t=[],n=[],r=te.join(e,".github","agents"),i=te.join(e,".github","instructions");for(let o of this.config.defaultAgents){let a=te.join(this.config.agentsRoot,`${o}.agent.md`),c=te.join(r,`${o}.agent.md`);if(Q.existsSync(a))if(Q.existsSync(c)){let d=Q.statSync(a),u=Q.statSync(c);d.mtimeMs>u.mtimeMs&&(await this.copyFile(a,c,!0),t.push(o))}else await this.copyFile(a,c),n.push(o)}for(let o of this.config.defaultInstructions){let a=te.join(this.config.instructionsRoot,`${o}.instructions.md`),c=te.join(i,`${o}.instructions.md`);if(Q.existsSync(a))if(Q.existsSync(c)){let d=Q.statSync(a),u=Q.statSync(c);d.mtimeMs>u.mtimeMs&&(await this.copyFile(a,c,!0),t.push(o))}else await this.copyFile(a,c),n.push(o)}return{updated:t,added:n}}getDeploymentPlan(){let e=this.config.defaultAgents.filter(n=>{let r=te.join(this.config.agentsRoot,`${n}.agent.md`);return Q.existsSync(r)}),t=this.config.defaultInstructions.filter(n=>{let r=te.join(this.config.instructionsRoot,`${n}.instructions.md`);return Q.existsSync(r)});return{agents:e,instructions:t}}async copyFile(e,t,n=!1){if(!Q.existsSync(e))return this.log(`Source not found: ${e}`),!1;if(Q.existsSync(t)&&!n)return this.log(`Target exists, skipping: ${t}`),!1;let r=te.dirname(t);return Q.existsSync(r)||Q.mkdirSync(r,{recursive:!0}),Q.copyFileSync(e,t),this.log(`Copied: ${e} -> ${t}`),!0}log(e){let t=new Date().toISOString();this.outputChannel.appendLine(`[${t}] ${e}`)}showLogs(){this.outputChannel.show()}dispose(){this.outputChannel.dispose()}};var de=z(require("vscode")),Dt=class s{static currentPanel;_panel;_disposables=[];static viewType="projectMemory.dashboard";constructor(e,t,n){this._panel=e,this._update(n),this._panel.onDidDispose(()=>this.dispose(),null,this._disposables),this._panel.webview.onDidReceiveMessage(r=>{r.type==="alert"&&de.window.showInformationMessage(r.text)},null,this._disposables)}static createOrShow(e,t){let n=de.window.activeTextEditor?de.window.activeTextEditor.viewColumn:void 0;if(s.currentPanel){s.currentPanel._panel.reveal(n),s.currentPanel._update(t);return}let r=de.window.createWebviewPanel(s.viewType,"\u{1F9E0} PMD",n||de.ViewColumn.One,{enableScripts:!0,retainContextWhenHidden:!0,localResourceRoots:[e]});s.currentPanel=new s(r,e,t)}static revive(e,t,n){s.currentPanel=new s(e,t,n)}_update(e){let t=this._panel.webview;this._panel.title="\u{1F9E0} PMD",this._panel.iconPath={light:de.Uri.joinPath(de.Uri.file(__dirname),"..","resources","icon.svg"),dark:de.Uri.joinPath(de.Uri.file(__dirname),"..","resources","icon.svg")},t.html=this._getHtmlForWebview(t,e)}_getHtmlForWebview(e,t){let n=hc();return`<!DOCTYPE html>
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
</html>`}dispose(){for(s.currentPanel=void 0,this._panel.dispose();this._disposables.length;){let e=this._disposables.pop();e&&e.dispose()}}};function hc(){let s="",e="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";for(let t=0;t<32;t++)s+=e.charAt(Math.floor(Math.random()*e.length));return s}var Ie=z(require("vscode")),Ft=z(require("http")),Ur=z(require("crypto")),Ye=class{connected=!1;serverPort=3001;serverHost="localhost";outputChannel;reconnectAttempts=0;maxReconnectAttempts=3;reconnectDelay=1e3;config;_onConnectionChange=new Ie.EventEmitter;onConnectionChange=this._onConnectionChange.event;constructor(e){this.config=e,this.outputChannel=Ie.window.createOutputChannel("Project Memory MCP Bridge");let t=Ie.workspace.getConfiguration("projectMemory");this.serverPort=t.get("serverPort")||3001}async connect(){if(this.connected){this.log("Already connected");return}try{let e=await this.httpGet("/api/health");if(e.status==="ok")this.connected=!0,this.reconnectAttempts=0,this._onConnectionChange.fire(!0),this.log(`Connected to shared server at localhost:${this.serverPort}`),this.log(`Data root: ${e.dataRoot}`);else throw new Error("Server health check failed")}catch(e){throw this.log(`Connection failed: ${e}`),this.connected=!1,this._onConnectionChange.fire(!1),new Error(`Could not connect to Project Memory server.
Please ensure the server is running (check PM Server status bar item).`)}}async disconnect(){this.connected&&(this.connected=!1,this._onConnectionChange.fire(!1),this.log("Disconnected from server"))}isConnected(){return this.connected}async reconnect(){this.connected=!1,this._onConnectionChange.fire(!1),await this.connect()}async callTool(e,t){if(!this.connected)throw new Error("Not connected to Project Memory server");this.log(`Calling tool: ${e} with args: ${JSON.stringify(t)}`);try{let n=await this.mapToolToHttp(e,t);return this.log(`Tool ${e} result: ${JSON.stringify(n).substring(0,200)}...`),n}catch(n){throw this.log(`Tool ${e} error: ${n}`),n}}async mapToolToHttp(e,t){switch(e){case"memory_workspace":return this.handleMemoryWorkspace(t);case"memory_plan":return this.handleMemoryPlan(t);case"memory_steps":return this.handleMemorySteps(t);case"memory_context":return this.handleMemoryContext(t);case"memory_agent":return this.handleMemoryAgent(t);case"register_workspace":return{workspace:{workspace_id:(await this.registerWorkspace(t.workspace_path)).workspace.workspace_id}};case"get_workspace_info":return this.handleMemoryWorkspace({action:"info",workspace_id:t.workspace_id});case"list_workspaces":return this.handleMemoryWorkspace({action:"list"});case"create_plan":return this.handleMemoryPlan({action:"create",workspace_id:t.workspace_id,title:t.title,description:t.description,category:t.category,priority:t.priority,goals:t.goals,success_criteria:t.success_criteria,template:t.template});case"get_plan_state":return this.handleMemoryPlan({action:"get",workspace_id:t.workspace_id,plan_id:t.plan_id});case"list_plans":return this.handleMemoryPlan({action:"list",workspace_id:t.workspace_id});case"update_step":return this.handleMemorySteps({action:"update",workspace_id:t.workspace_id,plan_id:t.plan_id,step_index:t.step_index??t.step_id,status:t.status,notes:t.notes});case"append_steps":return this.handleMemorySteps({action:"add",workspace_id:t.workspace_id,plan_id:t.plan_id,steps:t.steps});case"add_note":return this.handleMemoryPlan({action:"add_note",workspace_id:t.workspace_id,plan_id:t.plan_id,note:t.note,note_type:t.type||"info"});case"handoff":return this.handleMemoryAgent({action:"handoff",workspace_id:t.workspace_id,plan_id:t.plan_id,from_agent:t.from_agent,to_agent:t.to_agent??t.target_agent,reason:t.reason,summary:t.summary,artifacts:t.artifacts});case"get_lineage":return this.httpGet(`/api/plans/${t.workspace_id}/${t.plan_id}/lineage`);case"store_context":return this.handleMemoryContext({action:"store",workspace_id:t.workspace_id,plan_id:t.plan_id,type:t.type,data:t.data});case"get_context":return this.handleMemoryContext({action:"get",workspace_id:t.workspace_id,plan_id:t.plan_id,type:t.type});case"initialise_agent":return this.handleMemoryAgent({action:"init",...t});case"complete_agent":return this.handleMemoryAgent({action:"complete",...t});case"search":return this.httpGet(`/api/search?q=${encodeURIComponent(t.query)}`);default:throw new Error(`Unknown tool: ${e}`)}}async registerWorkspace(e){let n=(await this.httpGet("/api/workspaces")).workspaces.find(i=>i.path?.toLowerCase()===e.toLowerCase());return n?{workspace:{workspace_id:n.id}}:{workspace:{workspace_id:this.pathToWorkspaceId(e)}}}pathToWorkspaceId(e){let t=e.split(/[/\\]/).filter(Boolean).pop()||"workspace",n=Ur.createHash("sha256").update(e).digest("hex").substring(0,12);return`${t}-${n}`}async listTools(){return[{name:"memory_workspace",description:"Workspace management (register, list, info, reindex)"},{name:"memory_plan",description:"Plan management (list, get, create, archive, add_note)"},{name:"memory_steps",description:"Step management (update, batch_update, add)"},{name:"memory_context",description:"Context management (store, get)"},{name:"memory_agent",description:"Agent lifecycle and handoffs"},{name:"register_workspace",description:"Register a workspace"},{name:"list_workspaces",description:"List all workspaces"},{name:"get_workspace_info",description:"Get workspace details"},{name:"create_plan",description:"Create a new plan"},{name:"get_plan_state",description:"Get plan state"},{name:"list_plans",description:"List plans for a workspace"},{name:"update_step",description:"Update a plan step"},{name:"append_steps",description:"Add steps to a plan"},{name:"add_note",description:"Add a note to a plan"},{name:"handoff",description:"Hand off between agents"},{name:"get_lineage",description:"Get handoff lineage"},{name:"store_context",description:"Store context data"},{name:"get_context",description:"Get context data"},{name:"initialise_agent",description:"Initialize an agent session"},{name:"complete_agent",description:"Complete an agent session"},{name:"search",description:"Search across workspaces"}]}async handleMemoryWorkspace(e){let t=e.action;switch(t){case"register":return{workspace_id:(await this.registerWorkspace(e.workspace_path)).workspace.workspace_id};case"list":return this.httpGet("/api/workspaces");case"info":return this.httpGet(`/api/workspaces/${e.workspace_id}`);case"reindex":throw new Error("Workspace reindex is not available via the HTTP bridge.");default:throw new Error(`Unknown memory_workspace action: ${t}`)}}async handleMemoryPlan(e){let t=e.action,n=e.workspace_id,r=e.plan_id;if(!n)throw new Error("workspace_id is required");switch(t){case"list":{let i=await this.httpGet(`/api/plans/workspace/${n}`);return{active_plans:this.normalizePlanSummaries(i.plans||[]),total:i.total}}case"get":{if(!r)throw new Error("plan_id is required");let i=await this.httpGet(`/api/plans/${n}/${r}`);return this.normalizePlanState(i)}case"create":{let i=e.title,o=e.description;if(!i||!o)throw new Error("title and description are required");let a=e.template,c={title:i,description:o,category:e.category||"feature",priority:e.priority||"medium",goals:e.goals,success_criteria:e.success_criteria},d=a?await this.httpPost(`/api/plans/${n}/template`,{...c,template:a}):await this.httpPost(`/api/plans/${n}`,c);if(d&&typeof d=="object"&&"plan"in d){let u=d;if(u.plan)return this.normalizePlanState(u.plan)}return this.normalizePlanState(d)}case"archive":{if(!r)throw new Error("plan_id is required");return this.httpPost(`/api/plans/${n}/${r}/archive`,{})}case"add_note":{if(!r)throw new Error("plan_id is required");return this.httpPost(`/api/plans/${n}/${r}/notes`,{note:e.note,type:e.note_type||"info"})}default:throw new Error(`Unknown memory_plan action: ${t}`)}}async handleMemorySteps(e){let t=e.action,n=e.workspace_id,r=e.plan_id;if(!n||!r)throw new Error("workspace_id and plan_id are required");let i=await this.getPlanState(n,r),o=Array.isArray(i.steps)?[...i.steps]:[];switch(t){case"update":{let a=this.toStepIndex(e.step_index);if(a===null)throw new Error("step_index is required");if(!o[a])throw new Error(`Step index out of range: ${a}`);return e.status&&(o[a].status=e.status),e.notes&&(o[a].notes=e.notes),this.updatePlanSteps(n,r,o)}case"batch_update":{let a=e.updates;if(!a||a.length===0)throw new Error("updates array is required");for(let c of a){let d=this.toStepIndex(c.step_index);if(d===null||!o[d])throw new Error(`Step index out of range: ${c.step_index}`);c.status&&(o[d].status=c.status),c.notes&&(o[d].notes=c.notes)}return this.updatePlanSteps(n,r,o)}case"add":{let a=e.steps||[];if(a.length===0)throw new Error("steps array is required");let c=o.length,d=a.map((p,l)=>({index:c+l,phase:p.phase,task:p.task,status:p.status||"pending",type:p.type,assignee:p.assignee,requires_validation:p.requires_validation,notes:p.notes})),u=o.concat(d);return this.updatePlanSteps(n,r,u)}default:throw new Error(`Unknown memory_steps action: ${t}`)}}async handleMemoryContext(e){let t=e.action,n=e.workspace_id,r=e.plan_id;if(!n||!r)throw new Error("workspace_id and plan_id are required");switch(t){case"store":return this.httpPost(`/api/plans/${n}/${r}/context`,{type:e.type,data:e.data});case"get":{if(!e.type)throw new Error("type is required for context get");return this.httpGet(`/api/plans/${n}/${r}/context/${e.type}`)}case"store_initial":return this.httpPost(`/api/plans/${n}/${r}/context/initial`,{user_request:e.user_request,files_mentioned:e.files_mentioned,file_contents:e.file_contents,requirements:e.requirements,constraints:e.constraints,examples:e.examples,conversation_context:e.conversation_context,additional_notes:e.additional_notes});case"list":return(await this.httpGet(`/api/plans/${n}/${r}/context`)).context||[];case"list_research":return(await this.httpGet(`/api/plans/${n}/${r}/context/research`)).notes||[];case"append_research":return this.httpPost(`/api/plans/${n}/${r}/research`,{filename:e.filename,content:e.content});case"batch_store":{let i=Array.isArray(e.items)?e.items:[];if(i.length===0)throw new Error("items array is required for batch_store");let o=[];for(let a of i){let c=await this.httpPost(`/api/plans/${n}/${r}/context`,{type:a.type,data:a.data});o.push({type:a.type,result:c})}return{stored:o}}case"generate_instructions":throw new Error("generate_instructions is not available via the HTTP bridge.");default:throw new Error(`Unknown memory_context action: ${t}`)}}async handleMemoryAgent(e){let t=e.action,n=e.workspace_id,r=e.plan_id;switch(t){case"get_briefing":{if(!n||!r)throw new Error("workspace_id and plan_id are required");let i=await this.getPlanState(n,r),o=await this.httpGet(`/api/plans/${n}/${r}/lineage`);return{plan:this.normalizePlanState(i),lineage:o}}case"handoff":{if(!n||!r)throw new Error("workspace_id and plan_id are required");let i=e.to_agent||e.target_agent;if(!i)throw new Error("to_agent is required");let o=e.summary||e.reason||"Handoff requested";return this.httpPost(`/api/plans/${n}/${r}/handoff`,{from_agent:e.from_agent||e.agent_type||"Unknown",to_agent:i,reason:e.reason||o,summary:o,artifacts:e.artifacts})}case"init":case"complete":throw new Error("Agent sessions are not available via the HTTP bridge.");default:throw new Error(`Unknown memory_agent action: ${t}`)}}async getPlanState(e,t){let n=await this.httpGet(`/api/plans/${e}/${t}`);return this.normalizePlanState(n)}async updatePlanSteps(e,t,n){return this.httpPut(`/api/plans/${e}/${t}/steps`,{steps:n})}normalizePlanState(e){if(!e||typeof e!="object")return e;let t=e;return!t.plan_id&&typeof t.id=="string"&&(t.plan_id=t.id),Array.isArray(t.steps)&&(t.steps=t.steps.map((n,r)=>({index:typeof n.index=="number"?n.index:r,...n}))),t}normalizePlanSummaries(e){return e.map(t=>this.normalizePlanState(t))}toStepIndex(e){if(typeof e=="number"&&Number.isFinite(e))return e;if(typeof e=="string"&&e.trim().length>0){let t=Number(e);if(Number.isFinite(t))return t}return null}showLogs(){this.outputChannel.show()}dispose(){this.disconnect(),this._onConnectionChange.dispose(),this.outputChannel.dispose()}log(e){let t=new Date().toISOString();this.outputChannel.appendLine(`[${t}] ${e}`),console.log(`[MCP Bridge] ${e}`)}httpGet(e){return new Promise((t,n)=>{let r=`http://${this.serverHost}:${this.serverPort}${e}`;this.log(`GET ${r}`);let i=Ft.get(r,o=>{let a="";o.on("data",c=>a+=c),o.on("end",()=>{try{if(o.statusCode&&o.statusCode>=400){n(new Error(`HTTP ${o.statusCode}: ${a}`));return}let c=JSON.parse(a);t(c)}catch{n(new Error(`Failed to parse response: ${a}`))}})});i.on("error",n),i.setTimeout(1e4,()=>{i.destroy(),n(new Error("Request timeout"))})})}httpPost(e,t){return this.httpRequest("POST",e,t)}httpPut(e,t){return this.httpRequest("PUT",e,t)}httpRequest(e,t,n){return new Promise((r,i)=>{let o=JSON.stringify(n),a=`http://${this.serverHost}:${this.serverPort}${t}`;this.log(`${e} ${a}`);let c={hostname:this.serverHost,port:this.serverPort,path:t,method:e,headers:{"Content-Type":"application/json","Content-Length":Buffer.byteLength(o)}},d=Ft.request(c,u=>{let p="";u.on("data",l=>p+=l),u.on("end",()=>{try{if(u.statusCode&&u.statusCode>=400){i(new Error(`HTTP ${u.statusCode}: ${p}`));return}let l=JSON.parse(p);r(l)}catch{i(new Error(`Failed to parse response: ${p}`))}})});d.on("error",i),d.setTimeout(1e4,()=>{d.destroy(),i(new Error("Request timeout"))}),d.write(o),d.end()})}};var Me=z(require("vscode")),Qe=class{participant;mcpBridge;workspaceId=null;constructor(e){this.mcpBridge=e,this.participant=Me.chat.createChatParticipant("project-memory.memory",this.handleRequest.bind(this)),this.participant.iconPath=new Me.ThemeIcon("book"),this.participant.followupProvider={provideFollowups:this.provideFollowups.bind(this)}}async handleRequest(e,t,n,r){if(!this.mcpBridge.isConnected())return n.markdown(`\u26A0\uFE0F **Not connected to MCP server**

Use the "Project Memory: Reconnect Chat to MCP Server" command to reconnect.`),{metadata:{command:"error"}};await this.ensureWorkspaceRegistered(n);try{switch(e.command){case"plan":return await this.handlePlanCommand(e,n,r);case"context":return await this.handleContextCommand(e,n,r);case"handoff":return await this.handleHandoffCommand(e,n,r);case"status":return await this.handleStatusCommand(e,n,r);default:return await this.handleDefaultCommand(e,n,r)}}catch(i){let o=i instanceof Error?i.message:String(i);return n.markdown(`\u274C **Error**: ${o}`),{metadata:{command:"error"}}}}async ensureWorkspaceRegistered(e){if(this.workspaceId)return;let t=Me.workspace.workspaceFolders?.[0];if(!t){e.markdown(`\u26A0\uFE0F No workspace folder open. Please open a folder first.
`);return}if(!this.mcpBridge.isConnected()){e.markdown(`\u26A0\uFE0F MCP server not connected. Click the MCP status bar item to reconnect.
`);return}try{console.log(`Registering workspace: ${t.uri.fsPath}`);let n=await this.mcpBridge.callTool("memory_workspace",{action:"register",workspace_path:t.uri.fsPath});console.log(`Register workspace result: ${JSON.stringify(n)}`),n.workspace_id?(this.workspaceId=n.workspace_id,console.log(`Workspace registered: ${this.workspaceId}`)):(console.error("Unexpected response format:",n),e.markdown(`\u26A0\uFE0F Unexpected response from MCP server. Check console for details.
`))}catch(n){let r=n instanceof Error?n.message:String(n);console.error("Failed to register workspace:",n),e.markdown(`\u26A0\uFE0F Failed to register workspace: ${r}
`)}}async handlePlanCommand(e,t,n){let r=e.prompt.trim();if(!r||r==="list")return await this.listPlans(t);if(r.startsWith("create "))return await this.createPlan(r.substring(7),t);if(r.startsWith("show ")){let i=r.substring(5).trim();return await this.showPlan(i,t)}return t.markdown(`\u{1F4CB} **Plan Commands**

`),t.markdown("- `/plan list` - List all plans in this workspace\n"),t.markdown("- `/plan create <title>` - Create a new plan\n"),t.markdown("- `/plan show <plan-id>` - Show plan details\n"),t.markdown(`
Or just describe what you want to do and I'll help create a plan.`),{metadata:{command:"plan"}}}async listPlans(e){if(!this.workspaceId)return e.markdown("\u26A0\uFE0F Workspace not registered."),{metadata:{command:"plan"}};let n=(await this.mcpBridge.callTool("memory_plan",{action:"list",workspace_id:this.workspaceId})).active_plans||[];if(n.length===0)return e.markdown("\u{1F4CB} **No plans found**\n\nUse `/plan create <title>` to create a new plan."),{metadata:{command:"plan"}};e.markdown(`\u{1F4CB} **Plans in this workspace** (${n.length})

`);for(let r of n){let i=this.getStatusEmoji(r.status),o=r.plan_id||r.id||"unknown";e.markdown(`${i} **${r.title}** \`${o}\`
`),r.category&&e.markdown(`   Category: ${r.category}
`)}return{metadata:{command:"plan",plans:n.length}}}async createPlan(e,t){if(!this.workspaceId)return t.markdown("\u26A0\uFE0F Workspace not registered."),{metadata:{command:"plan"}};t.markdown(`\u{1F504} Creating plan: **${e}**...

`);let n=await this.mcpBridge.callTool("memory_plan",{action:"create",workspace_id:this.workspaceId,title:e,description:e,category:"feature"}),r=n.plan_id||n.id||"unknown";return t.markdown(`\u2705 **Plan created!**

`),t.markdown(`- **ID**: \`${r}\`
`),t.markdown(`- **Title**: ${n.title}
`),t.markdown(`
Use \`/plan show ${r}\` to see details.`),{metadata:{command:"plan",action:"created",planId:r}}}async showPlan(e,t){if(!this.workspaceId)return t.markdown("\u26A0\uFE0F Workspace not registered."),{metadata:{command:"plan"}};let n=await this.mcpBridge.callTool("memory_plan",{action:"get",workspace_id:this.workspaceId,plan_id:e}),r=n.plan_id||n.id||e;if(t.markdown(`# \u{1F4CB} ${n.title}

`),t.markdown(`**ID**: \`${r}\`
`),n.category&&t.markdown(`**Category**: ${n.category}
`),n.priority&&t.markdown(`**Priority**: ${n.priority}
`),n.description&&t.markdown(`
${n.description}
`),n.steps&&n.steps.length>0){t.markdown(`
## Steps

`);for(let i=0;i<n.steps.length;i++){let o=n.steps[i],a=this.getStepStatusEmoji(o.status);t.markdown(`${a} **${o.phase}**: ${o.task}
`)}}if(n.lineage&&n.lineage.length>0){t.markdown(`
## Agent History

`);for(let i of n.lineage)t.markdown(`- **${i.agent_type}** (${i.started_at})
`),i.summary&&t.markdown(`  ${i.summary}
`)}return{metadata:{command:"plan",action:"show",planId:e}}}async handleContextCommand(e,t,n){if(!this.workspaceId)return t.markdown("\u26A0\uFE0F Workspace not registered."),{metadata:{command:"context"}};t.markdown(`\u{1F50D} **Gathering workspace context...**

`);try{let r=await this.mcpBridge.callTool("memory_workspace",{action:"info",workspace_id:this.workspaceId});if(t.markdown(`## Workspace Information

`),t.markdown(`**ID**: \`${r.workspace_id}\`
`),t.markdown(`**Path**: \`${r.workspace_path}\`
`),r.codebase_profile){let i=r.codebase_profile;t.markdown(`
## Codebase Profile

`),i.languages&&i.languages.length>0&&t.markdown(`**Languages**: ${i.languages.join(", ")}
`),i.frameworks&&i.frameworks.length>0&&t.markdown(`**Frameworks**: ${i.frameworks.join(", ")}
`),i.file_count&&t.markdown(`**Files**: ${i.file_count}
`)}}catch{t.markdown(`\u26A0\uFE0F Could not retrieve full context. Basic workspace info:

`),t.markdown(`**Workspace ID**: \`${this.workspaceId}\`
`)}return{metadata:{command:"context"}}}async handleHandoffCommand(e,t,n){let r=e.prompt.trim();if(!r)return t.markdown(`\u{1F91D} **Handoff Command**

`),t.markdown("Usage: `/handoff <agent-type> <plan-id> [summary]`\n\n"),t.markdown(`**Available agents:**
`),t.markdown("- `Coordinator` - Orchestrates the workflow\n"),t.markdown("- `Researcher` - Gathers external information\n"),t.markdown("- `Architect` - Creates implementation plans\n"),t.markdown("- `Executor` - Implements the plan\n"),t.markdown("- `Reviewer` - Validates completed work\n"),t.markdown("- `Tester` - Writes and runs tests\n"),t.markdown("- `Archivist` - Finalizes and archives\n"),t.markdown("- `Analyst` - Deep investigation and analysis\n"),t.markdown("- `Brainstorm` - Explore and refine ideas\n"),t.markdown("- `Runner` - Quick tasks and exploration\n"),t.markdown("- `Builder` - Build verification and diagnostics\n"),{metadata:{command:"handoff"}};let i=r.split(" ");if(i.length<2)return t.markdown(`\u26A0\uFE0F Please provide both agent type and plan ID.
`),t.markdown("Example: `/handoff Executor plan_abc123`"),{metadata:{command:"handoff"}};let o=i[0],a=i[1],c=i.slice(2).join(" ")||"Handoff from chat";if(!this.workspaceId)return t.markdown("\u26A0\uFE0F Workspace not registered."),{metadata:{command:"handoff"}};t.markdown(`\u{1F504} Initiating handoff to **${o}**...

`);try{let d=await this.mcpBridge.callTool("memory_agent",{action:"handoff",workspace_id:this.workspaceId,plan_id:a,from_agent:"User",to_agent:o,summary:c});t.markdown(`\u2705 **Handoff recorded!**

`),t.markdown(`Plan \`${a}\` handoff to **${o}** has been recorded.
`),d?.warning&&t.markdown(`
\u26A0\uFE0F ${d.warning}
`)}catch(d){let u=d instanceof Error?d.message:String(d);t.markdown(`\u274C Handoff failed: ${u}`)}return{metadata:{command:"handoff",targetAgent:o,planId:a}}}async handleStatusCommand(e,t,n){if(!this.workspaceId)return t.markdown("\u26A0\uFE0F Workspace not registered."),{metadata:{command:"status"}};t.markdown(`\u{1F4CA} **Project Memory Status**

`);let r=this.mcpBridge.isConnected();t.markdown(`**MCP Server**: ${r?"\u{1F7E2} Connected":"\u{1F534} Disconnected"}
`),t.markdown(`**Workspace ID**: \`${this.workspaceId}\`

`);try{let a=((await this.mcpBridge.callTool("memory_plan",{action:"list",workspace_id:this.workspaceId})).active_plans||[]).filter(c=>c.status!=="archived");if(t.markdown(`## Active Plans (${a.length})

`),a.length===0)t.markdown(`No active plans.
`);else for(let c of a){let d=this.getStatusEmoji(c.status),u=c.done_steps??c.progress?.done??0,p=c.total_steps??c.progress?.total??0,l=c.plan_id||c.id;t.markdown(`${d} **${c.title}**${l?` (\`${l}\`)`:""}
`),p>0&&t.markdown(`   Progress: ${u}/${p} steps
`)}}catch{t.markdown(`Could not retrieve plan status.
`)}return{metadata:{command:"status"}}}async handleDefaultCommand(e,t,n){let r=e.prompt.trim();if(!r)return t.markdown(`\u{1F44B} **Welcome to Project Memory!**

`),t.markdown(`I can help you manage project plans and agent workflows.

`),t.markdown(`**Available commands:**
`),t.markdown("- `/plan` - View, create, or manage plans\n"),t.markdown("- `/context` - Get workspace context and codebase profile\n"),t.markdown("- `/handoff` - Execute agent handoffs\n"),t.markdown("- `/status` - Show current plan progress\n"),t.markdown(`
Or just ask me about your project!`),{metadata:{command:"help"}};if(r.toLowerCase().includes("plan")||r.toLowerCase().includes("create"))t.markdown(`I can help you with plans!

`),t.markdown("Try using the `/plan` command:\n"),t.markdown("- `/plan list` to see existing plans\n"),t.markdown(`- \`/plan create ${r}\` to create a new plan
`);else{if(r.toLowerCase().includes("status")||r.toLowerCase().includes("progress"))return await this.handleStatusCommand(e,t,n);t.markdown(`I understand you want to: **${r}**

`),t.markdown(`Here's what I can help with:
`),t.markdown(`- Use \`/plan create ${r}\` to create a plan for this
`),t.markdown("- Use `/status` to check current progress\n"),t.markdown("- Use `/context` to get workspace information\n")}return{metadata:{command:"default"}}}provideFollowups(e,t,n){let r=e.metadata,i=r?.command,o=[];switch(i){case"plan":r?.action==="created"&&r?.planId&&o.push({prompt:`/plan show ${r.planId}`,label:"View plan details",command:"plan"}),o.push({prompt:"/status",label:"Check status",command:"status"});break;case"status":o.push({prompt:"/plan list",label:"List all plans",command:"plan"});break;case"help":case"default":o.push({prompt:"/plan list",label:"List plans",command:"plan"}),o.push({prompt:"/status",label:"Check status",command:"status"});break}return o}getStatusEmoji(e){switch(e){case"active":return"\u{1F535}";case"completed":return"\u2705";case"archived":return"\u{1F4E6}";case"blocked":return"\u{1F534}";default:return"\u26AA"}}getStepStatusEmoji(e){switch(e){case"done":return"\u2705";case"active":return"\u{1F504}";case"blocked":return"\u{1F534}";default:return"\u2B1C"}}resetWorkspace(){this.workspaceId=null}dispose(){this.participant.dispose()}};var se=z(require("vscode")),Xe=class{mcpBridge;workspaceId=null;disposables=[];constructor(e){this.mcpBridge=e,this.registerTools()}registerTools(){this.disposables.push(se.lm.registerTool("memory_plan",{invoke:async(e,t)=>await this.handlePlan(e,t)})),this.disposables.push(se.lm.registerTool("memory_steps",{invoke:async(e,t)=>await this.handleSteps(e,t)})),this.disposables.push(se.lm.registerTool("memory_context",{invoke:async(e,t)=>await this.handleContext(e,t)}))}async ensureWorkspace(){if(this.workspaceId)return this.workspaceId;let e=se.workspace.workspaceFolders?.[0];if(!e)throw new Error("No workspace folder open");let t=await this.mcpBridge.callTool("memory_workspace",{action:"register",workspace_path:e.uri.fsPath});return this.workspaceId=t.workspace_id,this.workspaceId}async handlePlan(e,t){try{if(!this.mcpBridge.isConnected())return this.errorResult("MCP server not connected");let n=await this.ensureWorkspace(),{action:r,planId:i,title:o,description:a,category:c,priority:d,template:u,goals:p,success_criteria:l,includeArchived:f}=e.input,v;switch(r){case"list":let y=await this.mcpBridge.callTool("memory_plan",{action:"list",workspace_id:n,include_archived:f});v={workspace_id:n,plans:y.active_plans||[],total:(y.active_plans||[]).length,message:(y.active_plans||[]).length>0?`Found ${(y.active_plans||[]).length} plan(s)`:'No plans found. Use action "create" to create one.'};break;case"get":if(!i)return this.errorResult("planId is required for get action");v=await this.mcpBridge.callTool("memory_plan",{action:"get",workspace_id:n,plan_id:i});break;case"create":if(!o||!a)return this.errorResult("title and description are required for create action");v=await this.mcpBridge.callTool("memory_plan",{action:"create",workspace_id:n,title:o,description:a,category:c||"feature",priority:d||"medium",template:u,goals:p,success_criteria:l});break;case"archive":if(!i)return this.errorResult("planId is required for archive action");v=await this.mcpBridge.callTool("memory_plan",{action:"archive",workspace_id:n,plan_id:i});break;default:return this.errorResult(`Unknown action: ${r}`)}return new se.LanguageModelToolResult([new se.LanguageModelTextPart(JSON.stringify(v,null,2))])}catch(n){return this.errorResult(n)}}async handleSteps(e,t){try{if(!this.mcpBridge.isConnected())return this.errorResult("MCP server not connected");let n=await this.ensureWorkspace(),{action:r,planId:i,stepIndex:o,status:a,notes:c,updates:d,newSteps:u}=e.input;if(!i)return this.errorResult("planId is required");let p;switch(r){case"update":if(o===void 0||!a)return this.errorResult("stepIndex and status are required for update action");p=await this.mcpBridge.callTool("memory_steps",{action:"update",workspace_id:n,plan_id:i,step_index:o,status:a,notes:c});break;case"batch_update":if(!d||d.length===0)return this.errorResult("updates array is required for batch_update action");p=await this.mcpBridge.callTool("memory_steps",{action:"batch_update",workspace_id:n,plan_id:i,updates:d});break;case"add":if(!u||u.length===0)return this.errorResult("newSteps array is required for add action");p=await this.mcpBridge.callTool("memory_steps",{action:"add",workspace_id:n,plan_id:i,steps:u.map(l=>({...l,status:l.status||"pending"}))});break;default:return this.errorResult(`Unknown action: ${r}`)}return new se.LanguageModelToolResult([new se.LanguageModelTextPart(JSON.stringify(p,null,2))])}catch(n){return this.errorResult(n)}}async handleContext(e,t){try{if(!this.mcpBridge.isConnected())return this.errorResult("MCP server not connected");let n=await this.ensureWorkspace(),{action:r,planId:i,note:o,noteType:a,targetAgent:c,reason:d}=e.input,u;switch(r){case"add_note":if(!i||!o)return this.errorResult("planId and note are required for add_note action");u=await this.mcpBridge.callTool("memory_plan",{action:"add_note",workspace_id:n,plan_id:i,note:o,note_type:a||"info"});break;case"briefing":if(!i)return this.errorResult("planId is required for briefing action");u=await this.mcpBridge.callTool("memory_agent",{action:"get_briefing",workspace_id:n,plan_id:i});break;case"handoff":if(!i||!c||!d)return this.errorResult("planId, targetAgent, and reason are required for handoff action");u=await this.mcpBridge.callTool("memory_agent",{action:"handoff",workspace_id:n,plan_id:i,from_agent:"User",to_agent:c,reason:d});break;case"workspace":u=await this.mcpBridge.callTool("memory_workspace",{action:"info",workspace_id:n});break;default:return this.errorResult(`Unknown action: ${r}`)}return new se.LanguageModelToolResult([new se.LanguageModelTextPart(JSON.stringify(u,null,2))])}catch(n){return this.errorResult(n)}}errorResult(e){let t=e instanceof Error?e.message:String(e);return new se.LanguageModelToolResult([new se.LanguageModelTextPart(JSON.stringify({success:!1,error:t}))])}dispose(){this.disposables.forEach(e=>e.dispose()),this.disposables=[]}};var ue,Je,Fe,Os,j,Ze,ce=null,Ce=null,Re=null;function U(s,...e){return h.workspace.getConfiguration("projectMemory").get("showNotifications",!0)?h.window.showInformationMessage(s,...e):Promise.resolve(void 0)}function fc(s){console.log("Project Memory Dashboard extension activating...");let e=h.workspace.getConfiguration("projectMemory"),t=e.get("dataRoot")||qr(),n=e.get("agentsRoot")||De(),r=e.get("promptsRoot"),i=e.get("instructionsRoot"),o=e.get("serverPort")||3001,a=e.get("wsPort")||3002,c=e.get("autoStartServer")??!0,d=e.get("defaultAgents")||[],u=e.get("defaultInstructions")||[],p=e.get("autoDeployOnWorkspaceOpen")??!1;if(Ze=new Mt({agentsRoot:n,instructionsRoot:i||Ht(),defaultAgents:d,defaultInstructions:u}),p&&h.workspace.workspaceFolders?.[0]){let l=h.workspace.workspaceFolders[0].uri.fsPath;Ze.deployToWorkspace(l).then(f=>{(f.agents.length>0||f.instructions.length>0)&&U(`Deployed ${f.agents.length} agents and ${f.instructions.length} instructions`)})}j=new It({dataRoot:t,agentsRoot:n,promptsRoot:r,instructionsRoot:i,serverPort:o,wsPort:a}),s.subscriptions.push(j),c&&j.hasServerDirectory()&&j.start().then(async l=>{l?j.isExternalServer?U("Connected to existing Project Memory server"):U("Project Memory API server started"):h.window.showWarningMessage("Failed to start Project Memory server. Click to view logs.","View Logs").then(f=>{f==="View Logs"&&j.showLogs()})}),mc(s,e,t),ue=new ot(s.extensionUri,t,n),s.subscriptions.push(h.window.registerWebviewViewProvider("projectMemory.dashboardView",ue,{webviewOptions:{retainContextWhenHidden:!0}})),s.subscriptions.push(h.commands.registerCommand("projectMemory.showDashboard",()=>{h.commands.executeCommand("workbench.view.extension.projectMemory")}),h.commands.registerCommand("projectMemory.openDashboardPanel",async l=>{if(!j.isRunning){if(await h.window.showWarningMessage("Project Memory server is not running. Start it first?","Start Server","Cancel")!=="Start Server")return;if(!await h.window.withProgress({location:h.ProgressLocation.Notification,title:"Starting Project Memory server...",cancellable:!1},async()=>await j.start())){h.window.showErrorMessage("Failed to start server. Check logs for details."),j.showLogs();return}}if(!j.isFrontendRunning&&!await h.window.withProgress({location:h.ProgressLocation.Notification,title:"Starting dashboard frontend...",cancellable:!1},async()=>await j.startFrontend())){h.window.showErrorMessage("Failed to start dashboard frontend. Check server logs."),j.showLogs();return}let f=l||"http://localhost:5173";Dt.createOrShow(s.extensionUri,f)}),h.commands.registerCommand("projectMemory.toggleServer",async()=>{j.isRunning?(await j.stopFrontend(),await j.stop(),U("Project Memory server stopped")):await j.start()?U("Project Memory server started"):h.window.showErrorMessage("Failed to start Project Memory server")}),h.commands.registerCommand("projectMemory.startServer",async()=>{if(j.isRunning){U("Server is already running");return}await j.start()?U("Project Memory server started"):(h.window.showErrorMessage("Failed to start server. Check logs for details."),j.showLogs())}),h.commands.registerCommand("projectMemory.stopServer",async()=>{await j.stopFrontend(),await j.stop(),U("Project Memory server stopped")}),h.commands.registerCommand("projectMemory.restartServer",async()=>{U("Restarting Project Memory server..."),await j.stopFrontend(),await j.restart()?U("Project Memory server restarted"):h.window.showErrorMessage("Failed to restart server")}),h.commands.registerCommand("projectMemory.showServerLogs",()=>{j.showLogs()}),h.commands.registerCommand("projectMemory.openSettings",async()=>{let l=h.workspace.getConfiguration("projectMemory"),f=l.get("agentsRoot")||De(),v=l.get("instructionsRoot")||Ht(),y=l.get("promptsRoot")||Gr(),x=await h.window.showQuickPick([{label:"$(person) Configure Default Agents",description:"Select which agents to deploy by default",value:"agents"},{label:"$(book) Configure Default Instructions",description:"Select which instructions to deploy by default",value:"instructions"},{label:"$(file) Configure Default Prompts",description:"Select which prompts to deploy by default",value:"prompts"},{label:"$(gear) Open All Settings",description:"Open VS Code settings for Project Memory",value:"settings"}],{placeHolder:"What would you like to configure?"});if(!x)return;let T=require("fs");if(x.value==="settings"){h.commands.executeCommand("workbench.action.openSettings","@ext:project-memory.project-memory-dashboard");return}if(x.value==="agents"&&f)try{let S=T.readdirSync(f).filter(R=>R.endsWith(".agent.md")).map(R=>R.replace(".agent.md","")),C=l.get("defaultAgents")||[],F=S.map(R=>({label:R,picked:C.length===0||C.includes(R)})),$=await h.window.showQuickPick(F,{canPickMany:!0,placeHolder:"Select default agents (these will be pre-selected when deploying)",title:"Configure Default Agents"});$&&(await l.update("defaultAgents",$.map(R=>R.label),h.ConfigurationTarget.Global),U(`\u2705 Updated default agents (${$.length} selected)`))}catch(S){h.window.showErrorMessage(`Failed to read agents: ${S}`)}if(x.value==="instructions"&&v)try{let S=T.readdirSync(v).filter(R=>R.endsWith(".instructions.md")).map(R=>R.replace(".instructions.md","")),C=l.get("defaultInstructions")||[],F=S.map(R=>({label:R,picked:C.length===0||C.includes(R)})),$=await h.window.showQuickPick(F,{canPickMany:!0,placeHolder:"Select default instructions (these will be pre-selected when deploying)",title:"Configure Default Instructions"});$&&(await l.update("defaultInstructions",$.map(R=>R.label),h.ConfigurationTarget.Global),U(`\u2705 Updated default instructions (${$.length} selected)`))}catch(S){h.window.showErrorMessage(`Failed to read instructions: ${S}`)}if(x.value==="prompts"&&y)try{let S=T.readdirSync(y).filter(R=>R.endsWith(".prompt.md")).map(R=>R.replace(".prompt.md","")),C=l.get("defaultPrompts")||[],F=S.map(R=>({label:R,picked:C.length===0||C.includes(R)})),$=await h.window.showQuickPick(F,{canPickMany:!0,placeHolder:"Select default prompts (these will be pre-selected when deploying)",title:"Configure Default Prompts"});$&&(await l.update("defaultPrompts",$.map(R=>R.label),h.ConfigurationTarget.Global),U(`\u2705 Updated default prompts (${$.length} selected)`))}catch(S){h.window.showErrorMessage(`Failed to read prompts: ${S}`)}}),h.commands.registerCommand("projectMemory.createPlan",async()=>{let l=h.workspace.workspaceFolders;if(!l){h.window.showErrorMessage("No workspace folder open");return}let f=await h.window.showQuickPick([{label:"\u{1F9E0} Brainstorm First",description:"Explore ideas with an AI agent before creating a formal plan",value:"brainstorm"},{label:"\u{1F4DD} Create Plan Directly",description:"Create a formal plan with title, description, and category",value:"create"}],{placeHolder:"How would you like to start?"});if(!f)return;if(f.value==="brainstorm"){let P=await h.window.showInputBox({prompt:"What would you like to brainstorm?",placeHolder:"Describe the feature, problem, or idea you want to explore...",validateInput:A=>A.trim()?null:"Please enter a description"});if(!P)return;try{await h.commands.executeCommand("workbench.action.chat.open",{query:`@brainstorm ${P}`})}catch{await h.window.showInformationMessage("Open GitHub Copilot Chat and use @brainstorm agent with your prompt.","Copy Prompt")==="Copy Prompt"&&(await h.env.clipboard.writeText(`@brainstorm ${P}`),U("Prompt copied to clipboard"))}return}let v=await h.window.showInputBox({prompt:"Enter plan title",placeHolder:"My new feature...",validateInput:P=>P.trim()?null:"Title is required"});if(!v)return;let y=await h.window.showInputBox({prompt:"Enter plan description",placeHolder:"Describe what this plan will accomplish, the goals, and any context...",validateInput:P=>P.trim().length>=10?null:"Please provide at least a brief description (10+ characters)"});if(!y)return;let x=P=>P?P.split(/[,\n]+/).map(A=>A.trim()).filter(A=>A.length>0):[],T=[];try{let P=await fetch(`http://localhost:${o}/api/plans/templates`);if(P.ok){let A=await P.json();T=Array.isArray(A.templates)?A.templates:[]}}catch{}T.length===0&&(T=[{template:"feature",label:"Feature",category:"feature"},{template:"bugfix",label:"Bug Fix",category:"bug"},{template:"refactor",label:"Refactor",category:"refactor"},{template:"documentation",label:"Documentation",category:"documentation"},{template:"analysis",label:"Analysis",category:"analysis"},{template:"investigation",label:"Investigation",category:"investigation"}]);let S=await h.window.showQuickPick([{label:"Custom",description:"Choose category and define your own steps",value:"custom"},...T.map(P=>({label:P.label||P.template,description:P.category||P.template,value:P.template}))],{placeHolder:"Select a plan template (optional)"});if(!S)return;let C=S.value!=="custom"?S.value:null,F=null,$=[],R=[];if(!C){let P=await h.window.showQuickPick([{label:"\u2728 Feature",description:"New functionality or capability",value:"feature"},{label:"\u{1F41B} Bug",description:"Fix for an existing issue",value:"bug"},{label:"\u{1F504} Change",description:"Modification to existing behavior",value:"change"},{label:"\u{1F50D} Analysis",description:"Investigation or research task",value:"analysis"},{label:"\u{1F9EA} Investigation",description:"Deep-dive analysis with findings",value:"investigation"},{label:"\u{1F41E} Debug",description:"Debugging session for an issue",value:"debug"},{label:"\u267B\uFE0F Refactor",description:"Code improvement without behavior change",value:"refactor"},{label:"\u{1F4DA} Documentation",description:"Documentation updates",value:"documentation"}],{placeHolder:"Select plan category"});if(!P)return;F=P.value}let O=await h.window.showQuickPick([{label:"\u{1F534} Critical",description:"Urgent - needs immediate attention",value:"critical"},{label:"\u{1F7E0} High",description:"Important - should be done soon",value:"high"},{label:"\u{1F7E1} Medium",description:"Normal priority",value:"medium"},{label:"\u{1F7E2} Low",description:"Nice to have - when time permits",value:"low"}],{placeHolder:"Select priority level"});if(!O)return;if(!C&&F==="investigation"){let P=await h.window.showInputBox({prompt:"Enter investigation goals (comma-separated)",placeHolder:"Identify root cause, confirm scope"});$=x(P);let A=await h.window.showInputBox({prompt:"Enter success criteria (comma-separated)",placeHolder:"Root cause identified, resolution path defined"});if(R=x(A),$.length===0||R.length===0){h.window.showErrorMessage("Investigation plans require at least 1 goal and 1 success criteria.");return}}let b=l[0].uri.fsPath,I=require("path").basename(b).toLowerCase().replace(/[^a-z0-9]/g,"_").substring(0,20),B=require("crypto").createHash("md5").update(b).digest("hex").substring(0,12),w=`${I}-${B}`;try{let P={title:v,description:y,priority:O.value,goals:$.length>0?$:void 0,success_criteria:R.length>0?R:void 0},A=C?await fetch(`http://localhost:${o}/api/plans/${w}/template`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...P,template:C})}):await fetch(`http://localhost:${o}/api/plans/${w}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...P,category:F})});if(A.ok){let q=await A.json(),g=q.plan_id||q.plan?.id||q.plan?.plan_id||q.planId;U(`Plan created: ${v}`,"Open Dashboard").then(m=>{m==="Open Dashboard"&&g&&h.commands.executeCommand("projectMemory.openDashboardPanel",`http://localhost:5173/workspace/${w}/plan/${g}`)})}else{let q=await A.text();h.window.showErrorMessage(`Failed to create plan: ${q}`)}}catch(P){h.window.showErrorMessage(`Failed to create plan: ${P}`)}}),h.commands.registerCommand("projectMemory.deployAgents",async()=>{let l=h.workspace.workspaceFolders;if(!l){h.window.showErrorMessage("No workspace folder open");return}let f=h.workspace.getConfiguration("projectMemory"),v=f.get("agentsRoot"),y=v||De(),x=f.get("instructionsRoot")||Ht(),T=f.get("defaultAgents")||[],S=f.get("defaultInstructions")||[];if(console.log("[ProjectMemory] Deploy Agents - Config agentsRoot:",v),console.log("[ProjectMemory] Deploy Agents - Resolved agentsRoot:",y),console.log("[ProjectMemory] Deploy Agents - Default fallback would be:",De()),!y){h.window.showErrorMessage("Agents root not configured. Set projectMemory.agentsRoot in settings.");return}let C=l[0].uri.fsPath,F=require("fs"),$=require("path");try{let R=F.readdirSync(y).filter(A=>A.endsWith(".agent.md"));if(R.length===0){h.window.showWarningMessage("No agent files found in agents root");return}let O=R.map(A=>{let q=A.replace(".agent.md","");return{label:q,description:A,picked:T.length===0||T.includes(q)}}),b=await h.window.showQuickPick(O,{canPickMany:!0,placeHolder:"Select agents to deploy",title:"Deploy Agents"});if(!b||b.length===0)return;let I=$.join(C,".github","agents");F.mkdirSync(I,{recursive:!0});let B=0;for(let A of b){let q=`${A.label}.agent.md`,g=$.join(y,q),m=$.join(I,q);F.copyFileSync(g,m),B++}let w=0;if(x&&S.length>0){let A=$.join(C,".github","instructions");F.mkdirSync(A,{recursive:!0});for(let q of S){let g=`${q}.instructions.md`,m=$.join(x,g),J=$.join(A,g);F.existsSync(m)&&(F.copyFileSync(m,J),w++)}}ue.postMessage({type:"deploymentComplete",data:{type:"agents",count:B,instructionsCount:w,targetDir:I}});let P=w>0?`\u2705 Deployed ${B} agent(s) and ${w} instruction(s)`:`\u2705 Deployed ${B} agent(s)`;U(P,"Open Folder").then(A=>{A==="Open Folder"&&h.commands.executeCommand("revealInExplorer",h.Uri.file(I))})}catch(R){h.window.showErrorMessage(`Failed to deploy agents: ${R}`)}}),h.commands.registerCommand("projectMemory.deployPrompts",async()=>{let l=h.workspace.workspaceFolders;if(!l){h.window.showErrorMessage("No workspace folder open");return}let f=h.workspace.getConfiguration("projectMemory"),v=f.get("promptsRoot")||Gr(),y=f.get("defaultPrompts")||[];if(!v){h.window.showErrorMessage("Prompts root not configured. Set projectMemory.promptsRoot in settings.");return}let x=l[0].uri.fsPath,T=require("fs"),S=require("path");try{let C=T.readdirSync(v).filter(b=>b.endsWith(".prompt.md"));if(C.length===0){h.window.showWarningMessage("No prompt files found in prompts root");return}let F=C.map(b=>{let I=b.replace(".prompt.md","");return{label:I,description:b,picked:y.length===0||y.includes(I)}}),$=await h.window.showQuickPick(F,{canPickMany:!0,placeHolder:"Select prompts to deploy",title:"Deploy Prompts"});if(!$||$.length===0)return;let R=S.join(x,".github","prompts");T.mkdirSync(R,{recursive:!0});let O=0;for(let b of $){let I=`${b.label}.prompt.md`,B=S.join(v,I),w=S.join(R,I);T.copyFileSync(B,w),O++}ue.postMessage({type:"deploymentComplete",data:{type:"prompts",count:O,targetDir:R}}),U(`\u2705 Deployed ${O} prompt(s) to ${S.relative(x,R)}`,"Open Folder").then(b=>{b==="Open Folder"&&h.commands.executeCommand("revealInExplorer",h.Uri.file(R))})}catch(C){h.window.showErrorMessage(`Failed to deploy prompts: ${C}`)}}),h.commands.registerCommand("projectMemory.deployInstructions",async()=>{let l=h.workspace.workspaceFolders;if(!l){h.window.showErrorMessage("No workspace folder open");return}let f=h.workspace.getConfiguration("projectMemory"),v=f.get("instructionsRoot")||Ht(),y=f.get("defaultInstructions")||[];if(!v){h.window.showErrorMessage("Instructions root not configured. Set projectMemory.instructionsRoot in settings.");return}let x=l[0].uri.fsPath,T=require("fs"),S=require("path");try{let C=T.readdirSync(v).filter(b=>b.endsWith(".instructions.md"));if(C.length===0){h.window.showWarningMessage("No instruction files found in instructions root");return}let F=C.map(b=>{let I=b.replace(".instructions.md","");return{label:I,description:b,picked:y.length===0||y.includes(I)}}),$=await h.window.showQuickPick(F,{canPickMany:!0,placeHolder:"Select instructions to deploy",title:"Deploy Instructions"});if(!$||$.length===0)return;let R=S.join(x,".github","instructions");T.mkdirSync(R,{recursive:!0});let O=0;for(let b of $){let I=`${b.label}.instructions.md`,B=S.join(v,I),w=S.join(R,I);T.copyFileSync(B,w),O++}ue.postMessage({type:"deploymentComplete",data:{type:"instructions",count:O,targetDir:R}}),U(`\u2705 Deployed ${O} instruction(s) to ${S.relative(x,R)}`,"Open Folder").then(b=>{b==="Open Folder"&&h.commands.executeCommand("revealInExplorer",h.Uri.file(R))})}catch(C){h.window.showErrorMessage(`Failed to deploy instructions: ${C}`)}}),h.commands.registerCommand("projectMemory.deployCopilotConfig",async()=>{let l=h.workspace.workspaceFolders;if(!l){h.window.showErrorMessage("No workspace folder open");return}await h.window.showQuickPick(["Yes","No"],{placeHolder:"Deploy all Copilot config (agents, prompts, instructions)?"})==="Yes"&&(ue.postMessage({type:"deployAllCopilotConfig",data:{workspacePath:l[0].uri.fsPath}}),U("Deploying all Copilot configuration..."))}),h.commands.registerCommand("projectMemory.deployDefaults",async()=>{let l=h.workspace.workspaceFolders;if(!l){h.window.showErrorMessage("No workspace folder open");return}let f=Ze.getDeploymentPlan();if(await h.window.showQuickPick(["Yes","No"],{placeHolder:`Deploy ${f.agents.length} agents and ${f.instructions.length} instructions?`})==="Yes"){let y=await Ze.deployToWorkspace(l[0].uri.fsPath);U(`Deployed ${y.agents.length} agents and ${y.instructions.length} instructions`)}}),h.commands.registerCommand("projectMemory.updateDefaults",async()=>{let l=h.workspace.workspaceFolders;if(!l){h.window.showErrorMessage("No workspace folder open");return}let f=await Ze.updateWorkspace(l[0].uri.fsPath);f.updated.length>0||f.added.length>0?U(`Updated ${f.updated.length} files, added ${f.added.length} new files`):U("All files are up to date")}),h.commands.registerCommand("projectMemory.openAgentFile",async()=>{let f=h.workspace.getConfiguration("projectMemory").get("agentsRoot")||De();if(!f){h.window.showErrorMessage("Agents root not configured");return}let v=require("fs"),y=require("path");try{let x=v.readdirSync(f).filter(S=>S.endsWith(".agent.md")),T=await h.window.showQuickPick(x,{placeHolder:"Select an agent file to open"});if(T){let S=y.join(f,T),C=await h.workspace.openTextDocument(S);await h.window.showTextDocument(C)}}catch(x){h.window.showErrorMessage(`Failed to list agent files: ${x}`)}}),h.commands.registerCommand("projectMemory.openPromptFile",async()=>{let f=h.workspace.getConfiguration("projectMemory").get("promptsRoot");if(!f){h.window.showErrorMessage("Prompts root not configured. Set projectMemory.promptsRoot in settings.");return}let v=require("fs"),y=require("path");try{let x=v.readdirSync(f).filter(S=>S.endsWith(".prompt.md")),T=await h.window.showQuickPick(x,{placeHolder:"Select a prompt file to open"});if(T){let S=y.join(f,T),C=await h.workspace.openTextDocument(S);await h.window.showTextDocument(C)}}catch(x){h.window.showErrorMessage(`Failed to list prompt files: ${x}`)}}),h.commands.registerCommand("projectMemory.showCopilotStatus",()=>{ue.postMessage({type:"showCopilotStatus"}),h.commands.executeCommand("workbench.view.extension.projectMemory")}),h.commands.registerCommand("projectMemory.refreshData",()=>{ue.postMessage({type:"refresh"})}),h.commands.registerCommand("projectMemory.openFile",async(l,f)=>{try{let v=await h.workspace.openTextDocument(l),y=await h.window.showTextDocument(v);if(f!==void 0){let x=new h.Position(f-1,0);y.selection=new h.Selection(x,x),y.revealRange(new h.Range(x,x),h.TextEditorRevealType.InCenter)}}catch{h.window.showErrorMessage(`Failed to open file: ${l}`)}}),h.commands.registerCommand("projectMemory.addToPlan",async l=>{let f,v,y;if(l)f=l.fsPath;else{let C=h.window.activeTextEditor;if(C){f=C.document.uri.fsPath;let F=C.selection;F.isEmpty||(v=C.document.getText(F),y=F.start.line+1)}}if(!f){h.window.showErrorMessage("No file selected");return}if(!h.workspace.workspaceFolders){h.window.showErrorMessage("No workspace folder open");return}let T=await h.window.showInputBox({prompt:"Describe the step/task for this file",placeHolder:"e.g., Review and update authentication logic",value:v?`Review: ${v.substring(0,50)}...`:`Work on ${require("path").basename(f)}`});if(!T)return;let S=await h.window.showQuickPick(["investigation","research","analysis","planning","implementation","testing","validation","review","documentation","refactor","bugfix","handoff"],{placeHolder:"Select the phase for this step"});S&&(ue.postMessage({type:"addStepToPlan",data:{task:T,phase:S,file:f,line:y,notes:v?`Selected code:
\`\`\`
${v.substring(0,500)}
\`\`\``:void 0}}),U(`Added step to plan: "${T}"`))})),n&&(Je=new Pt(n,e.get("autoDeployAgents")||!1),Je.start(),s.subscriptions.push({dispose:()=>Je.stop()})),Fe=new St({agentsRoot:n,promptsRoot:r,instructionsRoot:i,autoDeploy:e.get("autoDeployAgents")||!1}),Fe.start(),Fe.onFileChanged((l,f,v)=>{v==="change"&&Os.showTemporaryMessage(`${l} updated`)}),s.subscriptions.push({dispose:()=>Fe.stop()}),Os=new Tt,s.subscriptions.push(Os),s.subscriptions.push(h.workspace.onDidChangeConfiguration(l=>{if(l.affectsConfiguration("projectMemory")){let f=h.workspace.getConfiguration("projectMemory");ue.updateConfig(f.get("dataRoot")||qr(),f.get("agentsRoot")||De())}})),console.log("Project Memory Dashboard extension activated")}async function gc(){console.log("Project Memory Dashboard extension deactivating..."),ce&&(await ce.disconnect(),ce.dispose(),ce=null),Ce&&(Ce.dispose(),Ce=null),Re&&(Re.dispose(),Re=null),ue&&ue.dispose(),Je&&Je.stop(),Fe&&Fe.stop(),j&&(await j.stopFrontend(),await j.stop()),console.log("Project Memory Dashboard extension deactivated")}function qr(){let s=h.workspace.workspaceFolders;return s?h.Uri.joinPath(s[0].uri,"data").fsPath:""}function De(){let s=h.workspace.workspaceFolders;return s?h.Uri.joinPath(s[0].uri,"agents").fsPath:""}function Ht(){let s=h.workspace.workspaceFolders;return s?h.Uri.joinPath(s[0].uri,"instructions").fsPath:""}function Gr(){let s=h.workspace.workspaceFolders;return s?h.Uri.joinPath(s[0].uri,"prompts").fsPath:""}function mc(s,e,t){let n=e.get("chat.serverMode")||"bundled",r=e.get("chat.podmanImage")||"project-memory-mcp:latest",i=e.get("chat.externalServerPath")||"",o=e.get("chat.autoConnect")??!0;ce=new Ye({serverMode:n,podmanImage:r,externalServerPath:i,dataRoot:t}),s.subscriptions.push(ce),ce.onConnectionChange(a=>{a&&(Ce?.resetWorkspace(),Re?.resetWorkspace())}),Ce=new Qe(ce),s.subscriptions.push(Ce),Re=new Xe(ce),s.subscriptions.push(Re),s.subscriptions.push(h.commands.registerCommand("projectMemory.chat.reconnect",async()=>{if(!ce){h.window.showErrorMessage("MCP Bridge not initialized");return}try{await h.window.withProgress({location:h.ProgressLocation.Notification,title:"Reconnecting to MCP server...",cancellable:!1},async()=>{await ce.reconnect()}),U("Connected to MCP server")}catch(a){let c=a instanceof Error?a.message:String(a);h.window.showErrorMessage(`Failed to connect: ${c}`),ce.showLogs()}})),o&&ce.connect().then(()=>{console.log("MCP Bridge connected")}).catch(a=>{console.warn("MCP Bridge auto-connect failed:",a)}),s.subscriptions.push(h.workspace.onDidChangeConfiguration(a=>{a.affectsConfiguration("projectMemory.chat")&&U("Chat configuration changed. Some changes may require reconnecting.","Reconnect").then(c=>{c==="Reconnect"&&h.commands.executeCommand("projectMemory.chat.reconnect")})})),s.subscriptions.push(h.workspace.onDidChangeWorkspaceFolders(()=>{Ce?.resetWorkspace(),Re?.resetWorkspace()})),console.log("Chat integration initialized")}0&&(module.exports={activate,deactivate});
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
