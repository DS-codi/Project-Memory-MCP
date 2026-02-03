"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// node_modules/picomatch/lib/constants.js
var require_constants = __commonJS({
  "node_modules/picomatch/lib/constants.js"(exports2, module2) {
    "use strict";
    var path6 = require("path");
    var WIN_SLASH = "\\\\/";
    var WIN_NO_SLASH = `[^${WIN_SLASH}]`;
    var DOT_LITERAL = "\\.";
    var PLUS_LITERAL = "\\+";
    var QMARK_LITERAL = "\\?";
    var SLASH_LITERAL = "\\/";
    var ONE_CHAR = "(?=.)";
    var QMARK = "[^/]";
    var END_ANCHOR = `(?:${SLASH_LITERAL}|$)`;
    var START_ANCHOR = `(?:^|${SLASH_LITERAL})`;
    var DOTS_SLASH = `${DOT_LITERAL}{1,2}${END_ANCHOR}`;
    var NO_DOT = `(?!${DOT_LITERAL})`;
    var NO_DOTS = `(?!${START_ANCHOR}${DOTS_SLASH})`;
    var NO_DOT_SLASH = `(?!${DOT_LITERAL}{0,1}${END_ANCHOR})`;
    var NO_DOTS_SLASH = `(?!${DOTS_SLASH})`;
    var QMARK_NO_DOT = `[^.${SLASH_LITERAL}]`;
    var STAR = `${QMARK}*?`;
    var POSIX_CHARS = {
      DOT_LITERAL,
      PLUS_LITERAL,
      QMARK_LITERAL,
      SLASH_LITERAL,
      ONE_CHAR,
      QMARK,
      END_ANCHOR,
      DOTS_SLASH,
      NO_DOT,
      NO_DOTS,
      NO_DOT_SLASH,
      NO_DOTS_SLASH,
      QMARK_NO_DOT,
      STAR,
      START_ANCHOR
    };
    var WINDOWS_CHARS = {
      ...POSIX_CHARS,
      SLASH_LITERAL: `[${WIN_SLASH}]`,
      QMARK: WIN_NO_SLASH,
      STAR: `${WIN_NO_SLASH}*?`,
      DOTS_SLASH: `${DOT_LITERAL}{1,2}(?:[${WIN_SLASH}]|$)`,
      NO_DOT: `(?!${DOT_LITERAL})`,
      NO_DOTS: `(?!(?:^|[${WIN_SLASH}])${DOT_LITERAL}{1,2}(?:[${WIN_SLASH}]|$))`,
      NO_DOT_SLASH: `(?!${DOT_LITERAL}{0,1}(?:[${WIN_SLASH}]|$))`,
      NO_DOTS_SLASH: `(?!${DOT_LITERAL}{1,2}(?:[${WIN_SLASH}]|$))`,
      QMARK_NO_DOT: `[^.${WIN_SLASH}]`,
      START_ANCHOR: `(?:^|[${WIN_SLASH}])`,
      END_ANCHOR: `(?:[${WIN_SLASH}]|$)`
    };
    var POSIX_REGEX_SOURCE = {
      alnum: "a-zA-Z0-9",
      alpha: "a-zA-Z",
      ascii: "\\x00-\\x7F",
      blank: " \\t",
      cntrl: "\\x00-\\x1F\\x7F",
      digit: "0-9",
      graph: "\\x21-\\x7E",
      lower: "a-z",
      print: "\\x20-\\x7E ",
      punct: "\\-!\"#$%&'()\\*+,./:;<=>?@[\\]^_`{|}~",
      space: " \\t\\r\\n\\v\\f",
      upper: "A-Z",
      word: "A-Za-z0-9_",
      xdigit: "A-Fa-f0-9"
    };
    module2.exports = {
      MAX_LENGTH: 1024 * 64,
      POSIX_REGEX_SOURCE,
      // regular expressions
      REGEX_BACKSLASH: /\\(?![*+?^${}(|)[\]])/g,
      REGEX_NON_SPECIAL_CHARS: /^[^@![\].,$*+?^{}()|\\/]+/,
      REGEX_SPECIAL_CHARS: /[-*+?.^${}(|)[\]]/,
      REGEX_SPECIAL_CHARS_BACKREF: /(\\?)((\W)(\3*))/g,
      REGEX_SPECIAL_CHARS_GLOBAL: /([-*+?.^${}(|)[\]])/g,
      REGEX_REMOVE_BACKSLASH: /(?:\[.*?[^\\]\]|\\(?=.))/g,
      // Replace globs with equivalent patterns to reduce parsing time.
      REPLACEMENTS: {
        "***": "*",
        "**/**": "**",
        "**/**/**": "**"
      },
      // Digits
      CHAR_0: 48,
      /* 0 */
      CHAR_9: 57,
      /* 9 */
      // Alphabet chars.
      CHAR_UPPERCASE_A: 65,
      /* A */
      CHAR_LOWERCASE_A: 97,
      /* a */
      CHAR_UPPERCASE_Z: 90,
      /* Z */
      CHAR_LOWERCASE_Z: 122,
      /* z */
      CHAR_LEFT_PARENTHESES: 40,
      /* ( */
      CHAR_RIGHT_PARENTHESES: 41,
      /* ) */
      CHAR_ASTERISK: 42,
      /* * */
      // Non-alphabetic chars.
      CHAR_AMPERSAND: 38,
      /* & */
      CHAR_AT: 64,
      /* @ */
      CHAR_BACKWARD_SLASH: 92,
      /* \ */
      CHAR_CARRIAGE_RETURN: 13,
      /* \r */
      CHAR_CIRCUMFLEX_ACCENT: 94,
      /* ^ */
      CHAR_COLON: 58,
      /* : */
      CHAR_COMMA: 44,
      /* , */
      CHAR_DOT: 46,
      /* . */
      CHAR_DOUBLE_QUOTE: 34,
      /* " */
      CHAR_EQUAL: 61,
      /* = */
      CHAR_EXCLAMATION_MARK: 33,
      /* ! */
      CHAR_FORM_FEED: 12,
      /* \f */
      CHAR_FORWARD_SLASH: 47,
      /* / */
      CHAR_GRAVE_ACCENT: 96,
      /* ` */
      CHAR_HASH: 35,
      /* # */
      CHAR_HYPHEN_MINUS: 45,
      /* - */
      CHAR_LEFT_ANGLE_BRACKET: 60,
      /* < */
      CHAR_LEFT_CURLY_BRACE: 123,
      /* { */
      CHAR_LEFT_SQUARE_BRACKET: 91,
      /* [ */
      CHAR_LINE_FEED: 10,
      /* \n */
      CHAR_NO_BREAK_SPACE: 160,
      /* \u00A0 */
      CHAR_PERCENT: 37,
      /* % */
      CHAR_PLUS: 43,
      /* + */
      CHAR_QUESTION_MARK: 63,
      /* ? */
      CHAR_RIGHT_ANGLE_BRACKET: 62,
      /* > */
      CHAR_RIGHT_CURLY_BRACE: 125,
      /* } */
      CHAR_RIGHT_SQUARE_BRACKET: 93,
      /* ] */
      CHAR_SEMICOLON: 59,
      /* ; */
      CHAR_SINGLE_QUOTE: 39,
      /* ' */
      CHAR_SPACE: 32,
      /*   */
      CHAR_TAB: 9,
      /* \t */
      CHAR_UNDERSCORE: 95,
      /* _ */
      CHAR_VERTICAL_LINE: 124,
      /* | */
      CHAR_ZERO_WIDTH_NOBREAK_SPACE: 65279,
      /* \uFEFF */
      SEP: path6.sep,
      /**
       * Create EXTGLOB_CHARS
       */
      extglobChars(chars) {
        return {
          "!": { type: "negate", open: "(?:(?!(?:", close: `))${chars.STAR})` },
          "?": { type: "qmark", open: "(?:", close: ")?" },
          "+": { type: "plus", open: "(?:", close: ")+" },
          "*": { type: "star", open: "(?:", close: ")*" },
          "@": { type: "at", open: "(?:", close: ")" }
        };
      },
      /**
       * Create GLOB_CHARS
       */
      globChars(win32) {
        return win32 === true ? WINDOWS_CHARS : POSIX_CHARS;
      }
    };
  }
});

// node_modules/picomatch/lib/utils.js
var require_utils = __commonJS({
  "node_modules/picomatch/lib/utils.js"(exports2) {
    "use strict";
    var path6 = require("path");
    var win32 = process.platform === "win32";
    var {
      REGEX_BACKSLASH,
      REGEX_REMOVE_BACKSLASH,
      REGEX_SPECIAL_CHARS,
      REGEX_SPECIAL_CHARS_GLOBAL
    } = require_constants();
    exports2.isObject = (val) => val !== null && typeof val === "object" && !Array.isArray(val);
    exports2.hasRegexChars = (str) => REGEX_SPECIAL_CHARS.test(str);
    exports2.isRegexChar = (str) => str.length === 1 && exports2.hasRegexChars(str);
    exports2.escapeRegex = (str) => str.replace(REGEX_SPECIAL_CHARS_GLOBAL, "\\$1");
    exports2.toPosixSlashes = (str) => str.replace(REGEX_BACKSLASH, "/");
    exports2.removeBackslashes = (str) => {
      return str.replace(REGEX_REMOVE_BACKSLASH, (match) => {
        return match === "\\" ? "" : match;
      });
    };
    exports2.supportsLookbehinds = () => {
      const segs = process.version.slice(1).split(".").map(Number);
      if (segs.length === 3 && segs[0] >= 9 || segs[0] === 8 && segs[1] >= 10) {
        return true;
      }
      return false;
    };
    exports2.isWindows = (options) => {
      if (options && typeof options.windows === "boolean") {
        return options.windows;
      }
      return win32 === true || path6.sep === "\\";
    };
    exports2.escapeLast = (input, char, lastIdx) => {
      const idx = input.lastIndexOf(char, lastIdx);
      if (idx === -1) return input;
      if (input[idx - 1] === "\\") return exports2.escapeLast(input, char, idx - 1);
      return `${input.slice(0, idx)}\\${input.slice(idx)}`;
    };
    exports2.removePrefix = (input, state = {}) => {
      let output = input;
      if (output.startsWith("./")) {
        output = output.slice(2);
        state.prefix = "./";
      }
      return output;
    };
    exports2.wrapOutput = (input, state = {}, options = {}) => {
      const prepend = options.contains ? "" : "^";
      const append = options.contains ? "" : "$";
      let output = `${prepend}(?:${input})${append}`;
      if (state.negated === true) {
        output = `(?:^(?!${output}).*$)`;
      }
      return output;
    };
  }
});

// node_modules/picomatch/lib/scan.js
var require_scan = __commonJS({
  "node_modules/picomatch/lib/scan.js"(exports2, module2) {
    "use strict";
    var utils = require_utils();
    var {
      CHAR_ASTERISK,
      /* * */
      CHAR_AT,
      /* @ */
      CHAR_BACKWARD_SLASH,
      /* \ */
      CHAR_COMMA,
      /* , */
      CHAR_DOT,
      /* . */
      CHAR_EXCLAMATION_MARK,
      /* ! */
      CHAR_FORWARD_SLASH,
      /* / */
      CHAR_LEFT_CURLY_BRACE,
      /* { */
      CHAR_LEFT_PARENTHESES,
      /* ( */
      CHAR_LEFT_SQUARE_BRACKET,
      /* [ */
      CHAR_PLUS,
      /* + */
      CHAR_QUESTION_MARK,
      /* ? */
      CHAR_RIGHT_CURLY_BRACE,
      /* } */
      CHAR_RIGHT_PARENTHESES,
      /* ) */
      CHAR_RIGHT_SQUARE_BRACKET
      /* ] */
    } = require_constants();
    var isPathSeparator = (code) => {
      return code === CHAR_FORWARD_SLASH || code === CHAR_BACKWARD_SLASH;
    };
    var depth = (token) => {
      if (token.isPrefix !== true) {
        token.depth = token.isGlobstar ? Infinity : 1;
      }
    };
    var scan = (input, options) => {
      const opts = options || {};
      const length = input.length - 1;
      const scanToEnd = opts.parts === true || opts.scanToEnd === true;
      const slashes = [];
      const tokens = [];
      const parts = [];
      let str = input;
      let index = -1;
      let start = 0;
      let lastIndex = 0;
      let isBrace = false;
      let isBracket = false;
      let isGlob = false;
      let isExtglob = false;
      let isGlobstar = false;
      let braceEscaped = false;
      let backslashes = false;
      let negated = false;
      let negatedExtglob = false;
      let finished = false;
      let braces = 0;
      let prev;
      let code;
      let token = { value: "", depth: 0, isGlob: false };
      const eos = () => index >= length;
      const peek = () => str.charCodeAt(index + 1);
      const advance = () => {
        prev = code;
        return str.charCodeAt(++index);
      };
      while (index < length) {
        code = advance();
        let next;
        if (code === CHAR_BACKWARD_SLASH) {
          backslashes = token.backslashes = true;
          code = advance();
          if (code === CHAR_LEFT_CURLY_BRACE) {
            braceEscaped = true;
          }
          continue;
        }
        if (braceEscaped === true || code === CHAR_LEFT_CURLY_BRACE) {
          braces++;
          while (eos() !== true && (code = advance())) {
            if (code === CHAR_BACKWARD_SLASH) {
              backslashes = token.backslashes = true;
              advance();
              continue;
            }
            if (code === CHAR_LEFT_CURLY_BRACE) {
              braces++;
              continue;
            }
            if (braceEscaped !== true && code === CHAR_DOT && (code = advance()) === CHAR_DOT) {
              isBrace = token.isBrace = true;
              isGlob = token.isGlob = true;
              finished = true;
              if (scanToEnd === true) {
                continue;
              }
              break;
            }
            if (braceEscaped !== true && code === CHAR_COMMA) {
              isBrace = token.isBrace = true;
              isGlob = token.isGlob = true;
              finished = true;
              if (scanToEnd === true) {
                continue;
              }
              break;
            }
            if (code === CHAR_RIGHT_CURLY_BRACE) {
              braces--;
              if (braces === 0) {
                braceEscaped = false;
                isBrace = token.isBrace = true;
                finished = true;
                break;
              }
            }
          }
          if (scanToEnd === true) {
            continue;
          }
          break;
        }
        if (code === CHAR_FORWARD_SLASH) {
          slashes.push(index);
          tokens.push(token);
          token = { value: "", depth: 0, isGlob: false };
          if (finished === true) continue;
          if (prev === CHAR_DOT && index === start + 1) {
            start += 2;
            continue;
          }
          lastIndex = index + 1;
          continue;
        }
        if (opts.noext !== true) {
          const isExtglobChar = code === CHAR_PLUS || code === CHAR_AT || code === CHAR_ASTERISK || code === CHAR_QUESTION_MARK || code === CHAR_EXCLAMATION_MARK;
          if (isExtglobChar === true && peek() === CHAR_LEFT_PARENTHESES) {
            isGlob = token.isGlob = true;
            isExtglob = token.isExtglob = true;
            finished = true;
            if (code === CHAR_EXCLAMATION_MARK && index === start) {
              negatedExtglob = true;
            }
            if (scanToEnd === true) {
              while (eos() !== true && (code = advance())) {
                if (code === CHAR_BACKWARD_SLASH) {
                  backslashes = token.backslashes = true;
                  code = advance();
                  continue;
                }
                if (code === CHAR_RIGHT_PARENTHESES) {
                  isGlob = token.isGlob = true;
                  finished = true;
                  break;
                }
              }
              continue;
            }
            break;
          }
        }
        if (code === CHAR_ASTERISK) {
          if (prev === CHAR_ASTERISK) isGlobstar = token.isGlobstar = true;
          isGlob = token.isGlob = true;
          finished = true;
          if (scanToEnd === true) {
            continue;
          }
          break;
        }
        if (code === CHAR_QUESTION_MARK) {
          isGlob = token.isGlob = true;
          finished = true;
          if (scanToEnd === true) {
            continue;
          }
          break;
        }
        if (code === CHAR_LEFT_SQUARE_BRACKET) {
          while (eos() !== true && (next = advance())) {
            if (next === CHAR_BACKWARD_SLASH) {
              backslashes = token.backslashes = true;
              advance();
              continue;
            }
            if (next === CHAR_RIGHT_SQUARE_BRACKET) {
              isBracket = token.isBracket = true;
              isGlob = token.isGlob = true;
              finished = true;
              break;
            }
          }
          if (scanToEnd === true) {
            continue;
          }
          break;
        }
        if (opts.nonegate !== true && code === CHAR_EXCLAMATION_MARK && index === start) {
          negated = token.negated = true;
          start++;
          continue;
        }
        if (opts.noparen !== true && code === CHAR_LEFT_PARENTHESES) {
          isGlob = token.isGlob = true;
          if (scanToEnd === true) {
            while (eos() !== true && (code = advance())) {
              if (code === CHAR_LEFT_PARENTHESES) {
                backslashes = token.backslashes = true;
                code = advance();
                continue;
              }
              if (code === CHAR_RIGHT_PARENTHESES) {
                finished = true;
                break;
              }
            }
            continue;
          }
          break;
        }
        if (isGlob === true) {
          finished = true;
          if (scanToEnd === true) {
            continue;
          }
          break;
        }
      }
      if (opts.noext === true) {
        isExtglob = false;
        isGlob = false;
      }
      let base = str;
      let prefix = "";
      let glob = "";
      if (start > 0) {
        prefix = str.slice(0, start);
        str = str.slice(start);
        lastIndex -= start;
      }
      if (base && isGlob === true && lastIndex > 0) {
        base = str.slice(0, lastIndex);
        glob = str.slice(lastIndex);
      } else if (isGlob === true) {
        base = "";
        glob = str;
      } else {
        base = str;
      }
      if (base && base !== "" && base !== "/" && base !== str) {
        if (isPathSeparator(base.charCodeAt(base.length - 1))) {
          base = base.slice(0, -1);
        }
      }
      if (opts.unescape === true) {
        if (glob) glob = utils.removeBackslashes(glob);
        if (base && backslashes === true) {
          base = utils.removeBackslashes(base);
        }
      }
      const state = {
        prefix,
        input,
        start,
        base,
        glob,
        isBrace,
        isBracket,
        isGlob,
        isExtglob,
        isGlobstar,
        negated,
        negatedExtglob
      };
      if (opts.tokens === true) {
        state.maxDepth = 0;
        if (!isPathSeparator(code)) {
          tokens.push(token);
        }
        state.tokens = tokens;
      }
      if (opts.parts === true || opts.tokens === true) {
        let prevIndex;
        for (let idx = 0; idx < slashes.length; idx++) {
          const n = prevIndex ? prevIndex + 1 : start;
          const i = slashes[idx];
          const value = input.slice(n, i);
          if (opts.tokens) {
            if (idx === 0 && start !== 0) {
              tokens[idx].isPrefix = true;
              tokens[idx].value = prefix;
            } else {
              tokens[idx].value = value;
            }
            depth(tokens[idx]);
            state.maxDepth += tokens[idx].depth;
          }
          if (idx !== 0 || value !== "") {
            parts.push(value);
          }
          prevIndex = i;
        }
        if (prevIndex && prevIndex + 1 < input.length) {
          const value = input.slice(prevIndex + 1);
          parts.push(value);
          if (opts.tokens) {
            tokens[tokens.length - 1].value = value;
            depth(tokens[tokens.length - 1]);
            state.maxDepth += tokens[tokens.length - 1].depth;
          }
        }
        state.slashes = slashes;
        state.parts = parts;
      }
      return state;
    };
    module2.exports = scan;
  }
});

// node_modules/picomatch/lib/parse.js
var require_parse = __commonJS({
  "node_modules/picomatch/lib/parse.js"(exports2, module2) {
    "use strict";
    var constants = require_constants();
    var utils = require_utils();
    var {
      MAX_LENGTH,
      POSIX_REGEX_SOURCE,
      REGEX_NON_SPECIAL_CHARS,
      REGEX_SPECIAL_CHARS_BACKREF,
      REPLACEMENTS
    } = constants;
    var expandRange = (args, options) => {
      if (typeof options.expandRange === "function") {
        return options.expandRange(...args, options);
      }
      args.sort();
      const value = `[${args.join("-")}]`;
      try {
        new RegExp(value);
      } catch (ex) {
        return args.map((v) => utils.escapeRegex(v)).join("..");
      }
      return value;
    };
    var syntaxError = (type, char) => {
      return `Missing ${type}: "${char}" - use "\\\\${char}" to match literal characters`;
    };
    var parse = (input, options) => {
      if (typeof input !== "string") {
        throw new TypeError("Expected a string");
      }
      input = REPLACEMENTS[input] || input;
      const opts = { ...options };
      const max = typeof opts.maxLength === "number" ? Math.min(MAX_LENGTH, opts.maxLength) : MAX_LENGTH;
      let len = input.length;
      if (len > max) {
        throw new SyntaxError(`Input length: ${len}, exceeds maximum allowed length: ${max}`);
      }
      const bos = { type: "bos", value: "", output: opts.prepend || "" };
      const tokens = [bos];
      const capture = opts.capture ? "" : "?:";
      const win32 = utils.isWindows(options);
      const PLATFORM_CHARS = constants.globChars(win32);
      const EXTGLOB_CHARS = constants.extglobChars(PLATFORM_CHARS);
      const {
        DOT_LITERAL,
        PLUS_LITERAL,
        SLASH_LITERAL,
        ONE_CHAR,
        DOTS_SLASH,
        NO_DOT,
        NO_DOT_SLASH,
        NO_DOTS_SLASH,
        QMARK,
        QMARK_NO_DOT,
        STAR,
        START_ANCHOR
      } = PLATFORM_CHARS;
      const globstar = (opts2) => {
        return `(${capture}(?:(?!${START_ANCHOR}${opts2.dot ? DOTS_SLASH : DOT_LITERAL}).)*?)`;
      };
      const nodot = opts.dot ? "" : NO_DOT;
      const qmarkNoDot = opts.dot ? QMARK : QMARK_NO_DOT;
      let star = opts.bash === true ? globstar(opts) : STAR;
      if (opts.capture) {
        star = `(${star})`;
      }
      if (typeof opts.noext === "boolean") {
        opts.noextglob = opts.noext;
      }
      const state = {
        input,
        index: -1,
        start: 0,
        dot: opts.dot === true,
        consumed: "",
        output: "",
        prefix: "",
        backtrack: false,
        negated: false,
        brackets: 0,
        braces: 0,
        parens: 0,
        quotes: 0,
        globstar: false,
        tokens
      };
      input = utils.removePrefix(input, state);
      len = input.length;
      const extglobs = [];
      const braces = [];
      const stack = [];
      let prev = bos;
      let value;
      const eos = () => state.index === len - 1;
      const peek = state.peek = (n = 1) => input[state.index + n];
      const advance = state.advance = () => input[++state.index] || "";
      const remaining = () => input.slice(state.index + 1);
      const consume = (value2 = "", num = 0) => {
        state.consumed += value2;
        state.index += num;
      };
      const append = (token) => {
        state.output += token.output != null ? token.output : token.value;
        consume(token.value);
      };
      const negate = () => {
        let count = 1;
        while (peek() === "!" && (peek(2) !== "(" || peek(3) === "?")) {
          advance();
          state.start++;
          count++;
        }
        if (count % 2 === 0) {
          return false;
        }
        state.negated = true;
        state.start++;
        return true;
      };
      const increment = (type) => {
        state[type]++;
        stack.push(type);
      };
      const decrement = (type) => {
        state[type]--;
        stack.pop();
      };
      const push = (tok) => {
        if (prev.type === "globstar") {
          const isBrace = state.braces > 0 && (tok.type === "comma" || tok.type === "brace");
          const isExtglob = tok.extglob === true || extglobs.length && (tok.type === "pipe" || tok.type === "paren");
          if (tok.type !== "slash" && tok.type !== "paren" && !isBrace && !isExtglob) {
            state.output = state.output.slice(0, -prev.output.length);
            prev.type = "star";
            prev.value = "*";
            prev.output = star;
            state.output += prev.output;
          }
        }
        if (extglobs.length && tok.type !== "paren") {
          extglobs[extglobs.length - 1].inner += tok.value;
        }
        if (tok.value || tok.output) append(tok);
        if (prev && prev.type === "text" && tok.type === "text") {
          prev.value += tok.value;
          prev.output = (prev.output || "") + tok.value;
          return;
        }
        tok.prev = prev;
        tokens.push(tok);
        prev = tok;
      };
      const extglobOpen = (type, value2) => {
        const token = { ...EXTGLOB_CHARS[value2], conditions: 1, inner: "" };
        token.prev = prev;
        token.parens = state.parens;
        token.output = state.output;
        const output = (opts.capture ? "(" : "") + token.open;
        increment("parens");
        push({ type, value: value2, output: state.output ? "" : ONE_CHAR });
        push({ type: "paren", extglob: true, value: advance(), output });
        extglobs.push(token);
      };
      const extglobClose = (token) => {
        let output = token.close + (opts.capture ? ")" : "");
        let rest;
        if (token.type === "negate") {
          let extglobStar = star;
          if (token.inner && token.inner.length > 1 && token.inner.includes("/")) {
            extglobStar = globstar(opts);
          }
          if (extglobStar !== star || eos() || /^\)+$/.test(remaining())) {
            output = token.close = `)$))${extglobStar}`;
          }
          if (token.inner.includes("*") && (rest = remaining()) && /^\.[^\\/.]+$/.test(rest)) {
            const expression = parse(rest, { ...options, fastpaths: false }).output;
            output = token.close = `)${expression})${extglobStar})`;
          }
          if (token.prev.type === "bos") {
            state.negatedExtglob = true;
          }
        }
        push({ type: "paren", extglob: true, value, output });
        decrement("parens");
      };
      if (opts.fastpaths !== false && !/(^[*!]|[/()[\]{}"])/.test(input)) {
        let backslashes = false;
        let output = input.replace(REGEX_SPECIAL_CHARS_BACKREF, (m, esc, chars, first, rest, index) => {
          if (first === "\\") {
            backslashes = true;
            return m;
          }
          if (first === "?") {
            if (esc) {
              return esc + first + (rest ? QMARK.repeat(rest.length) : "");
            }
            if (index === 0) {
              return qmarkNoDot + (rest ? QMARK.repeat(rest.length) : "");
            }
            return QMARK.repeat(chars.length);
          }
          if (first === ".") {
            return DOT_LITERAL.repeat(chars.length);
          }
          if (first === "*") {
            if (esc) {
              return esc + first + (rest ? star : "");
            }
            return star;
          }
          return esc ? m : `\\${m}`;
        });
        if (backslashes === true) {
          if (opts.unescape === true) {
            output = output.replace(/\\/g, "");
          } else {
            output = output.replace(/\\+/g, (m) => {
              return m.length % 2 === 0 ? "\\\\" : m ? "\\" : "";
            });
          }
        }
        if (output === input && opts.contains === true) {
          state.output = input;
          return state;
        }
        state.output = utils.wrapOutput(output, state, options);
        return state;
      }
      while (!eos()) {
        value = advance();
        if (value === "\0") {
          continue;
        }
        if (value === "\\") {
          const next = peek();
          if (next === "/" && opts.bash !== true) {
            continue;
          }
          if (next === "." || next === ";") {
            continue;
          }
          if (!next) {
            value += "\\";
            push({ type: "text", value });
            continue;
          }
          const match = /^\\+/.exec(remaining());
          let slashes = 0;
          if (match && match[0].length > 2) {
            slashes = match[0].length;
            state.index += slashes;
            if (slashes % 2 !== 0) {
              value += "\\";
            }
          }
          if (opts.unescape === true) {
            value = advance();
          } else {
            value += advance();
          }
          if (state.brackets === 0) {
            push({ type: "text", value });
            continue;
          }
        }
        if (state.brackets > 0 && (value !== "]" || prev.value === "[" || prev.value === "[^")) {
          if (opts.posix !== false && value === ":") {
            const inner = prev.value.slice(1);
            if (inner.includes("[")) {
              prev.posix = true;
              if (inner.includes(":")) {
                const idx = prev.value.lastIndexOf("[");
                const pre = prev.value.slice(0, idx);
                const rest2 = prev.value.slice(idx + 2);
                const posix = POSIX_REGEX_SOURCE[rest2];
                if (posix) {
                  prev.value = pre + posix;
                  state.backtrack = true;
                  advance();
                  if (!bos.output && tokens.indexOf(prev) === 1) {
                    bos.output = ONE_CHAR;
                  }
                  continue;
                }
              }
            }
          }
          if (value === "[" && peek() !== ":" || value === "-" && peek() === "]") {
            value = `\\${value}`;
          }
          if (value === "]" && (prev.value === "[" || prev.value === "[^")) {
            value = `\\${value}`;
          }
          if (opts.posix === true && value === "!" && prev.value === "[") {
            value = "^";
          }
          prev.value += value;
          append({ value });
          continue;
        }
        if (state.quotes === 1 && value !== '"') {
          value = utils.escapeRegex(value);
          prev.value += value;
          append({ value });
          continue;
        }
        if (value === '"') {
          state.quotes = state.quotes === 1 ? 0 : 1;
          if (opts.keepQuotes === true) {
            push({ type: "text", value });
          }
          continue;
        }
        if (value === "(") {
          increment("parens");
          push({ type: "paren", value });
          continue;
        }
        if (value === ")") {
          if (state.parens === 0 && opts.strictBrackets === true) {
            throw new SyntaxError(syntaxError("opening", "("));
          }
          const extglob = extglobs[extglobs.length - 1];
          if (extglob && state.parens === extglob.parens + 1) {
            extglobClose(extglobs.pop());
            continue;
          }
          push({ type: "paren", value, output: state.parens ? ")" : "\\)" });
          decrement("parens");
          continue;
        }
        if (value === "[") {
          if (opts.nobracket === true || !remaining().includes("]")) {
            if (opts.nobracket !== true && opts.strictBrackets === true) {
              throw new SyntaxError(syntaxError("closing", "]"));
            }
            value = `\\${value}`;
          } else {
            increment("brackets");
          }
          push({ type: "bracket", value });
          continue;
        }
        if (value === "]") {
          if (opts.nobracket === true || prev && prev.type === "bracket" && prev.value.length === 1) {
            push({ type: "text", value, output: `\\${value}` });
            continue;
          }
          if (state.brackets === 0) {
            if (opts.strictBrackets === true) {
              throw new SyntaxError(syntaxError("opening", "["));
            }
            push({ type: "text", value, output: `\\${value}` });
            continue;
          }
          decrement("brackets");
          const prevValue = prev.value.slice(1);
          if (prev.posix !== true && prevValue[0] === "^" && !prevValue.includes("/")) {
            value = `/${value}`;
          }
          prev.value += value;
          append({ value });
          if (opts.literalBrackets === false || utils.hasRegexChars(prevValue)) {
            continue;
          }
          const escaped = utils.escapeRegex(prev.value);
          state.output = state.output.slice(0, -prev.value.length);
          if (opts.literalBrackets === true) {
            state.output += escaped;
            prev.value = escaped;
            continue;
          }
          prev.value = `(${capture}${escaped}|${prev.value})`;
          state.output += prev.value;
          continue;
        }
        if (value === "{" && opts.nobrace !== true) {
          increment("braces");
          const open = {
            type: "brace",
            value,
            output: "(",
            outputIndex: state.output.length,
            tokensIndex: state.tokens.length
          };
          braces.push(open);
          push(open);
          continue;
        }
        if (value === "}") {
          const brace = braces[braces.length - 1];
          if (opts.nobrace === true || !brace) {
            push({ type: "text", value, output: value });
            continue;
          }
          let output = ")";
          if (brace.dots === true) {
            const arr = tokens.slice();
            const range = [];
            for (let i = arr.length - 1; i >= 0; i--) {
              tokens.pop();
              if (arr[i].type === "brace") {
                break;
              }
              if (arr[i].type !== "dots") {
                range.unshift(arr[i].value);
              }
            }
            output = expandRange(range, opts);
            state.backtrack = true;
          }
          if (brace.comma !== true && brace.dots !== true) {
            const out = state.output.slice(0, brace.outputIndex);
            const toks = state.tokens.slice(brace.tokensIndex);
            brace.value = brace.output = "\\{";
            value = output = "\\}";
            state.output = out;
            for (const t of toks) {
              state.output += t.output || t.value;
            }
          }
          push({ type: "brace", value, output });
          decrement("braces");
          braces.pop();
          continue;
        }
        if (value === "|") {
          if (extglobs.length > 0) {
            extglobs[extglobs.length - 1].conditions++;
          }
          push({ type: "text", value });
          continue;
        }
        if (value === ",") {
          let output = value;
          const brace = braces[braces.length - 1];
          if (brace && stack[stack.length - 1] === "braces") {
            brace.comma = true;
            output = "|";
          }
          push({ type: "comma", value, output });
          continue;
        }
        if (value === "/") {
          if (prev.type === "dot" && state.index === state.start + 1) {
            state.start = state.index + 1;
            state.consumed = "";
            state.output = "";
            tokens.pop();
            prev = bos;
            continue;
          }
          push({ type: "slash", value, output: SLASH_LITERAL });
          continue;
        }
        if (value === ".") {
          if (state.braces > 0 && prev.type === "dot") {
            if (prev.value === ".") prev.output = DOT_LITERAL;
            const brace = braces[braces.length - 1];
            prev.type = "dots";
            prev.output += value;
            prev.value += value;
            brace.dots = true;
            continue;
          }
          if (state.braces + state.parens === 0 && prev.type !== "bos" && prev.type !== "slash") {
            push({ type: "text", value, output: DOT_LITERAL });
            continue;
          }
          push({ type: "dot", value, output: DOT_LITERAL });
          continue;
        }
        if (value === "?") {
          const isGroup = prev && prev.value === "(";
          if (!isGroup && opts.noextglob !== true && peek() === "(" && peek(2) !== "?") {
            extglobOpen("qmark", value);
            continue;
          }
          if (prev && prev.type === "paren") {
            const next = peek();
            let output = value;
            if (next === "<" && !utils.supportsLookbehinds()) {
              throw new Error("Node.js v10 or higher is required for regex lookbehinds");
            }
            if (prev.value === "(" && !/[!=<:]/.test(next) || next === "<" && !/<([!=]|\w+>)/.test(remaining())) {
              output = `\\${value}`;
            }
            push({ type: "text", value, output });
            continue;
          }
          if (opts.dot !== true && (prev.type === "slash" || prev.type === "bos")) {
            push({ type: "qmark", value, output: QMARK_NO_DOT });
            continue;
          }
          push({ type: "qmark", value, output: QMARK });
          continue;
        }
        if (value === "!") {
          if (opts.noextglob !== true && peek() === "(") {
            if (peek(2) !== "?" || !/[!=<:]/.test(peek(3))) {
              extglobOpen("negate", value);
              continue;
            }
          }
          if (opts.nonegate !== true && state.index === 0) {
            negate();
            continue;
          }
        }
        if (value === "+") {
          if (opts.noextglob !== true && peek() === "(" && peek(2) !== "?") {
            extglobOpen("plus", value);
            continue;
          }
          if (prev && prev.value === "(" || opts.regex === false) {
            push({ type: "plus", value, output: PLUS_LITERAL });
            continue;
          }
          if (prev && (prev.type === "bracket" || prev.type === "paren" || prev.type === "brace") || state.parens > 0) {
            push({ type: "plus", value });
            continue;
          }
          push({ type: "plus", value: PLUS_LITERAL });
          continue;
        }
        if (value === "@") {
          if (opts.noextglob !== true && peek() === "(" && peek(2) !== "?") {
            push({ type: "at", extglob: true, value, output: "" });
            continue;
          }
          push({ type: "text", value });
          continue;
        }
        if (value !== "*") {
          if (value === "$" || value === "^") {
            value = `\\${value}`;
          }
          const match = REGEX_NON_SPECIAL_CHARS.exec(remaining());
          if (match) {
            value += match[0];
            state.index += match[0].length;
          }
          push({ type: "text", value });
          continue;
        }
        if (prev && (prev.type === "globstar" || prev.star === true)) {
          prev.type = "star";
          prev.star = true;
          prev.value += value;
          prev.output = star;
          state.backtrack = true;
          state.globstar = true;
          consume(value);
          continue;
        }
        let rest = remaining();
        if (opts.noextglob !== true && /^\([^?]/.test(rest)) {
          extglobOpen("star", value);
          continue;
        }
        if (prev.type === "star") {
          if (opts.noglobstar === true) {
            consume(value);
            continue;
          }
          const prior = prev.prev;
          const before = prior.prev;
          const isStart = prior.type === "slash" || prior.type === "bos";
          const afterStar = before && (before.type === "star" || before.type === "globstar");
          if (opts.bash === true && (!isStart || rest[0] && rest[0] !== "/")) {
            push({ type: "star", value, output: "" });
            continue;
          }
          const isBrace = state.braces > 0 && (prior.type === "comma" || prior.type === "brace");
          const isExtglob = extglobs.length && (prior.type === "pipe" || prior.type === "paren");
          if (!isStart && prior.type !== "paren" && !isBrace && !isExtglob) {
            push({ type: "star", value, output: "" });
            continue;
          }
          while (rest.slice(0, 3) === "/**") {
            const after = input[state.index + 4];
            if (after && after !== "/") {
              break;
            }
            rest = rest.slice(3);
            consume("/**", 3);
          }
          if (prior.type === "bos" && eos()) {
            prev.type = "globstar";
            prev.value += value;
            prev.output = globstar(opts);
            state.output = prev.output;
            state.globstar = true;
            consume(value);
            continue;
          }
          if (prior.type === "slash" && prior.prev.type !== "bos" && !afterStar && eos()) {
            state.output = state.output.slice(0, -(prior.output + prev.output).length);
            prior.output = `(?:${prior.output}`;
            prev.type = "globstar";
            prev.output = globstar(opts) + (opts.strictSlashes ? ")" : "|$)");
            prev.value += value;
            state.globstar = true;
            state.output += prior.output + prev.output;
            consume(value);
            continue;
          }
          if (prior.type === "slash" && prior.prev.type !== "bos" && rest[0] === "/") {
            const end = rest[1] !== void 0 ? "|$" : "";
            state.output = state.output.slice(0, -(prior.output + prev.output).length);
            prior.output = `(?:${prior.output}`;
            prev.type = "globstar";
            prev.output = `${globstar(opts)}${SLASH_LITERAL}|${SLASH_LITERAL}${end})`;
            prev.value += value;
            state.output += prior.output + prev.output;
            state.globstar = true;
            consume(value + advance());
            push({ type: "slash", value: "/", output: "" });
            continue;
          }
          if (prior.type === "bos" && rest[0] === "/") {
            prev.type = "globstar";
            prev.value += value;
            prev.output = `(?:^|${SLASH_LITERAL}|${globstar(opts)}${SLASH_LITERAL})`;
            state.output = prev.output;
            state.globstar = true;
            consume(value + advance());
            push({ type: "slash", value: "/", output: "" });
            continue;
          }
          state.output = state.output.slice(0, -prev.output.length);
          prev.type = "globstar";
          prev.output = globstar(opts);
          prev.value += value;
          state.output += prev.output;
          state.globstar = true;
          consume(value);
          continue;
        }
        const token = { type: "star", value, output: star };
        if (opts.bash === true) {
          token.output = ".*?";
          if (prev.type === "bos" || prev.type === "slash") {
            token.output = nodot + token.output;
          }
          push(token);
          continue;
        }
        if (prev && (prev.type === "bracket" || prev.type === "paren") && opts.regex === true) {
          token.output = value;
          push(token);
          continue;
        }
        if (state.index === state.start || prev.type === "slash" || prev.type === "dot") {
          if (prev.type === "dot") {
            state.output += NO_DOT_SLASH;
            prev.output += NO_DOT_SLASH;
          } else if (opts.dot === true) {
            state.output += NO_DOTS_SLASH;
            prev.output += NO_DOTS_SLASH;
          } else {
            state.output += nodot;
            prev.output += nodot;
          }
          if (peek() !== "*") {
            state.output += ONE_CHAR;
            prev.output += ONE_CHAR;
          }
        }
        push(token);
      }
      while (state.brackets > 0) {
        if (opts.strictBrackets === true) throw new SyntaxError(syntaxError("closing", "]"));
        state.output = utils.escapeLast(state.output, "[");
        decrement("brackets");
      }
      while (state.parens > 0) {
        if (opts.strictBrackets === true) throw new SyntaxError(syntaxError("closing", ")"));
        state.output = utils.escapeLast(state.output, "(");
        decrement("parens");
      }
      while (state.braces > 0) {
        if (opts.strictBrackets === true) throw new SyntaxError(syntaxError("closing", "}"));
        state.output = utils.escapeLast(state.output, "{");
        decrement("braces");
      }
      if (opts.strictSlashes !== true && (prev.type === "star" || prev.type === "bracket")) {
        push({ type: "maybe_slash", value: "", output: `${SLASH_LITERAL}?` });
      }
      if (state.backtrack === true) {
        state.output = "";
        for (const token of state.tokens) {
          state.output += token.output != null ? token.output : token.value;
          if (token.suffix) {
            state.output += token.suffix;
          }
        }
      }
      return state;
    };
    parse.fastpaths = (input, options) => {
      const opts = { ...options };
      const max = typeof opts.maxLength === "number" ? Math.min(MAX_LENGTH, opts.maxLength) : MAX_LENGTH;
      const len = input.length;
      if (len > max) {
        throw new SyntaxError(`Input length: ${len}, exceeds maximum allowed length: ${max}`);
      }
      input = REPLACEMENTS[input] || input;
      const win32 = utils.isWindows(options);
      const {
        DOT_LITERAL,
        SLASH_LITERAL,
        ONE_CHAR,
        DOTS_SLASH,
        NO_DOT,
        NO_DOTS,
        NO_DOTS_SLASH,
        STAR,
        START_ANCHOR
      } = constants.globChars(win32);
      const nodot = opts.dot ? NO_DOTS : NO_DOT;
      const slashDot = opts.dot ? NO_DOTS_SLASH : NO_DOT;
      const capture = opts.capture ? "" : "?:";
      const state = { negated: false, prefix: "" };
      let star = opts.bash === true ? ".*?" : STAR;
      if (opts.capture) {
        star = `(${star})`;
      }
      const globstar = (opts2) => {
        if (opts2.noglobstar === true) return star;
        return `(${capture}(?:(?!${START_ANCHOR}${opts2.dot ? DOTS_SLASH : DOT_LITERAL}).)*?)`;
      };
      const create = (str) => {
        switch (str) {
          case "*":
            return `${nodot}${ONE_CHAR}${star}`;
          case ".*":
            return `${DOT_LITERAL}${ONE_CHAR}${star}`;
          case "*.*":
            return `${nodot}${star}${DOT_LITERAL}${ONE_CHAR}${star}`;
          case "*/*":
            return `${nodot}${star}${SLASH_LITERAL}${ONE_CHAR}${slashDot}${star}`;
          case "**":
            return nodot + globstar(opts);
          case "**/*":
            return `(?:${nodot}${globstar(opts)}${SLASH_LITERAL})?${slashDot}${ONE_CHAR}${star}`;
          case "**/*.*":
            return `(?:${nodot}${globstar(opts)}${SLASH_LITERAL})?${slashDot}${star}${DOT_LITERAL}${ONE_CHAR}${star}`;
          case "**/.*":
            return `(?:${nodot}${globstar(opts)}${SLASH_LITERAL})?${DOT_LITERAL}${ONE_CHAR}${star}`;
          default: {
            const match = /^(.*?)\.(\w+)$/.exec(str);
            if (!match) return;
            const source2 = create(match[1]);
            if (!source2) return;
            return source2 + DOT_LITERAL + match[2];
          }
        }
      };
      const output = utils.removePrefix(input, state);
      let source = create(output);
      if (source && opts.strictSlashes !== true) {
        source += `${SLASH_LITERAL}?`;
      }
      return source;
    };
    module2.exports = parse;
  }
});

// node_modules/picomatch/lib/picomatch.js
var require_picomatch = __commonJS({
  "node_modules/picomatch/lib/picomatch.js"(exports2, module2) {
    "use strict";
    var path6 = require("path");
    var scan = require_scan();
    var parse = require_parse();
    var utils = require_utils();
    var constants = require_constants();
    var isObject = (val) => val && typeof val === "object" && !Array.isArray(val);
    var picomatch = (glob, options, returnState = false) => {
      if (Array.isArray(glob)) {
        const fns = glob.map((input) => picomatch(input, options, returnState));
        const arrayMatcher = (str) => {
          for (const isMatch of fns) {
            const state2 = isMatch(str);
            if (state2) return state2;
          }
          return false;
        };
        return arrayMatcher;
      }
      const isState = isObject(glob) && glob.tokens && glob.input;
      if (glob === "" || typeof glob !== "string" && !isState) {
        throw new TypeError("Expected pattern to be a non-empty string");
      }
      const opts = options || {};
      const posix = utils.isWindows(options);
      const regex = isState ? picomatch.compileRe(glob, options) : picomatch.makeRe(glob, options, false, true);
      const state = regex.state;
      delete regex.state;
      let isIgnored = () => false;
      if (opts.ignore) {
        const ignoreOpts = { ...options, ignore: null, onMatch: null, onResult: null };
        isIgnored = picomatch(opts.ignore, ignoreOpts, returnState);
      }
      const matcher = (input, returnObject = false) => {
        const { isMatch, match, output } = picomatch.test(input, regex, options, { glob, posix });
        const result = { glob, state, regex, posix, input, output, match, isMatch };
        if (typeof opts.onResult === "function") {
          opts.onResult(result);
        }
        if (isMatch === false) {
          result.isMatch = false;
          return returnObject ? result : false;
        }
        if (isIgnored(input)) {
          if (typeof opts.onIgnore === "function") {
            opts.onIgnore(result);
          }
          result.isMatch = false;
          return returnObject ? result : false;
        }
        if (typeof opts.onMatch === "function") {
          opts.onMatch(result);
        }
        return returnObject ? result : true;
      };
      if (returnState) {
        matcher.state = state;
      }
      return matcher;
    };
    picomatch.test = (input, regex, options, { glob, posix } = {}) => {
      if (typeof input !== "string") {
        throw new TypeError("Expected input to be a string");
      }
      if (input === "") {
        return { isMatch: false, output: "" };
      }
      const opts = options || {};
      const format = opts.format || (posix ? utils.toPosixSlashes : null);
      let match = input === glob;
      let output = match && format ? format(input) : input;
      if (match === false) {
        output = format ? format(input) : input;
        match = output === glob;
      }
      if (match === false || opts.capture === true) {
        if (opts.matchBase === true || opts.basename === true) {
          match = picomatch.matchBase(input, regex, options, posix);
        } else {
          match = regex.exec(output);
        }
      }
      return { isMatch: Boolean(match), match, output };
    };
    picomatch.matchBase = (input, glob, options, posix = utils.isWindows(options)) => {
      const regex = glob instanceof RegExp ? glob : picomatch.makeRe(glob, options);
      return regex.test(path6.basename(input));
    };
    picomatch.isMatch = (str, patterns, options) => picomatch(patterns, options)(str);
    picomatch.parse = (pattern, options) => {
      if (Array.isArray(pattern)) return pattern.map((p) => picomatch.parse(p, options));
      return parse(pattern, { ...options, fastpaths: false });
    };
    picomatch.scan = (input, options) => scan(input, options);
    picomatch.compileRe = (state, options, returnOutput = false, returnState = false) => {
      if (returnOutput === true) {
        return state.output;
      }
      const opts = options || {};
      const prepend = opts.contains ? "" : "^";
      const append = opts.contains ? "" : "$";
      let source = `${prepend}(?:${state.output})${append}`;
      if (state && state.negated === true) {
        source = `^(?!${source}).*$`;
      }
      const regex = picomatch.toRegex(source, options);
      if (returnState === true) {
        regex.state = state;
      }
      return regex;
    };
    picomatch.makeRe = (input, options = {}, returnOutput = false, returnState = false) => {
      if (!input || typeof input !== "string") {
        throw new TypeError("Expected a non-empty string");
      }
      let parsed = { negated: false, fastpaths: true };
      if (options.fastpaths !== false && (input[0] === "." || input[0] === "*")) {
        parsed.output = parse.fastpaths(input, options);
      }
      if (!parsed.output) {
        parsed = parse(input, options);
      }
      return picomatch.compileRe(parsed, options, returnOutput, returnState);
    };
    picomatch.toRegex = (source, options) => {
      try {
        const opts = options || {};
        return new RegExp(source, opts.flags || (opts.nocase ? "i" : ""));
      } catch (err) {
        if (options && options.debug === true) throw err;
        return /$^/;
      }
    };
    picomatch.constants = constants;
    module2.exports = picomatch;
  }
});

// node_modules/picomatch/index.js
var require_picomatch2 = __commonJS({
  "node_modules/picomatch/index.js"(exports2, module2) {
    "use strict";
    module2.exports = require_picomatch();
  }
});

// node_modules/readdirp/index.js
var require_readdirp = __commonJS({
  "node_modules/readdirp/index.js"(exports2, module2) {
    "use strict";
    var fs2 = require("fs");
    var { Readable } = require("stream");
    var sysPath = require("path");
    var { promisify } = require("util");
    var picomatch = require_picomatch2();
    var readdir = promisify(fs2.readdir);
    var stat = promisify(fs2.stat);
    var lstat = promisify(fs2.lstat);
    var realpath = promisify(fs2.realpath);
    var BANG = "!";
    var RECURSIVE_ERROR_CODE = "READDIRP_RECURSIVE_ERROR";
    var NORMAL_FLOW_ERRORS = /* @__PURE__ */ new Set(["ENOENT", "EPERM", "EACCES", "ELOOP", RECURSIVE_ERROR_CODE]);
    var FILE_TYPE = "files";
    var DIR_TYPE = "directories";
    var FILE_DIR_TYPE = "files_directories";
    var EVERYTHING_TYPE = "all";
    var ALL_TYPES = [FILE_TYPE, DIR_TYPE, FILE_DIR_TYPE, EVERYTHING_TYPE];
    var isNormalFlowError = (error) => NORMAL_FLOW_ERRORS.has(error.code);
    var [maj, min] = process.versions.node.split(".").slice(0, 2).map((n) => Number.parseInt(n, 10));
    var wantBigintFsStats = process.platform === "win32" && (maj > 10 || maj === 10 && min >= 5);
    var normalizeFilter = (filter) => {
      if (filter === void 0) return;
      if (typeof filter === "function") return filter;
      if (typeof filter === "string") {
        const glob = picomatch(filter.trim());
        return (entry) => glob(entry.basename);
      }
      if (Array.isArray(filter)) {
        const positive = [];
        const negative = [];
        for (const item of filter) {
          const trimmed = item.trim();
          if (trimmed.charAt(0) === BANG) {
            negative.push(picomatch(trimmed.slice(1)));
          } else {
            positive.push(picomatch(trimmed));
          }
        }
        if (negative.length > 0) {
          if (positive.length > 0) {
            return (entry) => positive.some((f) => f(entry.basename)) && !negative.some((f) => f(entry.basename));
          }
          return (entry) => !negative.some((f) => f(entry.basename));
        }
        return (entry) => positive.some((f) => f(entry.basename));
      }
    };
    var ReaddirpStream = class _ReaddirpStream extends Readable {
      static get defaultOptions() {
        return {
          root: ".",
          /* eslint-disable no-unused-vars */
          fileFilter: (path6) => true,
          directoryFilter: (path6) => true,
          /* eslint-enable no-unused-vars */
          type: FILE_TYPE,
          lstat: false,
          depth: 2147483648,
          alwaysStat: false
        };
      }
      constructor(options = {}) {
        super({
          objectMode: true,
          autoDestroy: true,
          highWaterMark: options.highWaterMark || 4096
        });
        const opts = { ..._ReaddirpStream.defaultOptions, ...options };
        const { root, type } = opts;
        this._fileFilter = normalizeFilter(opts.fileFilter);
        this._directoryFilter = normalizeFilter(opts.directoryFilter);
        const statMethod = opts.lstat ? lstat : stat;
        if (wantBigintFsStats) {
          this._stat = (path6) => statMethod(path6, { bigint: true });
        } else {
          this._stat = statMethod;
        }
        this._maxDepth = opts.depth;
        this._wantsDir = [DIR_TYPE, FILE_DIR_TYPE, EVERYTHING_TYPE].includes(type);
        this._wantsFile = [FILE_TYPE, FILE_DIR_TYPE, EVERYTHING_TYPE].includes(type);
        this._wantsEverything = type === EVERYTHING_TYPE;
        this._root = sysPath.resolve(root);
        this._isDirent = "Dirent" in fs2 && !opts.alwaysStat;
        this._statsProp = this._isDirent ? "dirent" : "stats";
        this._rdOptions = { encoding: "utf8", withFileTypes: this._isDirent };
        this.parents = [this._exploreDir(root, 1)];
        this.reading = false;
        this.parent = void 0;
      }
      async _read(batch) {
        if (this.reading) return;
        this.reading = true;
        try {
          while (!this.destroyed && batch > 0) {
            const { path: path6, depth, files = [] } = this.parent || {};
            if (files.length > 0) {
              const slice = files.splice(0, batch).map((dirent) => this._formatEntry(dirent, path6));
              for (const entry of await Promise.all(slice)) {
                if (this.destroyed) return;
                const entryType = await this._getEntryType(entry);
                if (entryType === "directory" && this._directoryFilter(entry)) {
                  if (depth <= this._maxDepth) {
                    this.parents.push(this._exploreDir(entry.fullPath, depth + 1));
                  }
                  if (this._wantsDir) {
                    this.push(entry);
                    batch--;
                  }
                } else if ((entryType === "file" || this._includeAsFile(entry)) && this._fileFilter(entry)) {
                  if (this._wantsFile) {
                    this.push(entry);
                    batch--;
                  }
                }
              }
            } else {
              const parent = this.parents.pop();
              if (!parent) {
                this.push(null);
                break;
              }
              this.parent = await parent;
              if (this.destroyed) return;
            }
          }
        } catch (error) {
          this.destroy(error);
        } finally {
          this.reading = false;
        }
      }
      async _exploreDir(path6, depth) {
        let files;
        try {
          files = await readdir(path6, this._rdOptions);
        } catch (error) {
          this._onError(error);
        }
        return { files, depth, path: path6 };
      }
      async _formatEntry(dirent, path6) {
        let entry;
        try {
          const basename4 = this._isDirent ? dirent.name : dirent;
          const fullPath = sysPath.resolve(sysPath.join(path6, basename4));
          entry = { path: sysPath.relative(this._root, fullPath), fullPath, basename: basename4 };
          entry[this._statsProp] = this._isDirent ? dirent : await this._stat(fullPath);
        } catch (err) {
          this._onError(err);
        }
        return entry;
      }
      _onError(err) {
        if (isNormalFlowError(err) && !this.destroyed) {
          this.emit("warn", err);
        } else {
          this.destroy(err);
        }
      }
      async _getEntryType(entry) {
        const stats = entry && entry[this._statsProp];
        if (!stats) {
          return;
        }
        if (stats.isFile()) {
          return "file";
        }
        if (stats.isDirectory()) {
          return "directory";
        }
        if (stats && stats.isSymbolicLink()) {
          const full = entry.fullPath;
          try {
            const entryRealPath = await realpath(full);
            const entryRealPathStats = await lstat(entryRealPath);
            if (entryRealPathStats.isFile()) {
              return "file";
            }
            if (entryRealPathStats.isDirectory()) {
              const len = entryRealPath.length;
              if (full.startsWith(entryRealPath) && full.substr(len, 1) === sysPath.sep) {
                const recursiveError = new Error(
                  `Circular symlink detected: "${full}" points to "${entryRealPath}"`
                );
                recursiveError.code = RECURSIVE_ERROR_CODE;
                return this._onError(recursiveError);
              }
              return "directory";
            }
          } catch (error) {
            this._onError(error);
          }
        }
      }
      _includeAsFile(entry) {
        const stats = entry && entry[this._statsProp];
        return stats && this._wantsEverything && !stats.isDirectory();
      }
    };
    var readdirp = (root, options = {}) => {
      let type = options.entryType || options.type;
      if (type === "both") type = FILE_DIR_TYPE;
      if (type) options.type = type;
      if (!root) {
        throw new Error("readdirp: root argument is required. Usage: readdirp(root, options)");
      } else if (typeof root !== "string") {
        throw new TypeError("readdirp: root argument must be a string. Usage: readdirp(root, options)");
      } else if (type && !ALL_TYPES.includes(type)) {
        throw new Error(`readdirp: Invalid type passed. Use one of ${ALL_TYPES.join(", ")}`);
      }
      options.root = root;
      return new ReaddirpStream(options);
    };
    var readdirpPromise = (root, options = {}) => {
      return new Promise((resolve, reject) => {
        const files = [];
        readdirp(root, options).on("data", (entry) => files.push(entry)).on("end", () => resolve(files)).on("error", (error) => reject(error));
      });
    };
    readdirp.promise = readdirpPromise;
    readdirp.ReaddirpStream = ReaddirpStream;
    readdirp.default = readdirp;
    module2.exports = readdirp;
  }
});

// node_modules/normalize-path/index.js
var require_normalize_path = __commonJS({
  "node_modules/normalize-path/index.js"(exports2, module2) {
    module2.exports = function(path6, stripTrailing) {
      if (typeof path6 !== "string") {
        throw new TypeError("expected path to be a string");
      }
      if (path6 === "\\" || path6 === "/") return "/";
      var len = path6.length;
      if (len <= 1) return path6;
      var prefix = "";
      if (len > 4 && path6[3] === "\\") {
        var ch = path6[2];
        if ((ch === "?" || ch === ".") && path6.slice(0, 2) === "\\\\") {
          path6 = path6.slice(2);
          prefix = "//";
        }
      }
      var segs = path6.split(/[/\\]+/);
      if (stripTrailing !== false && segs[segs.length - 1] === "") {
        segs.pop();
      }
      return prefix + segs.join("/");
    };
  }
});

// node_modules/anymatch/index.js
var require_anymatch = __commonJS({
  "node_modules/anymatch/index.js"(exports2, module2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var picomatch = require_picomatch2();
    var normalizePath = require_normalize_path();
    var BANG = "!";
    var DEFAULT_OPTIONS = { returnIndex: false };
    var arrify = (item) => Array.isArray(item) ? item : [item];
    var createPattern = (matcher, options) => {
      if (typeof matcher === "function") {
        return matcher;
      }
      if (typeof matcher === "string") {
        const glob = picomatch(matcher, options);
        return (string) => matcher === string || glob(string);
      }
      if (matcher instanceof RegExp) {
        return (string) => matcher.test(string);
      }
      return (string) => false;
    };
    var matchPatterns = (patterns, negPatterns, args, returnIndex) => {
      const isList = Array.isArray(args);
      const _path = isList ? args[0] : args;
      if (!isList && typeof _path !== "string") {
        throw new TypeError("anymatch: second argument must be a string: got " + Object.prototype.toString.call(_path));
      }
      const path6 = normalizePath(_path, false);
      for (let index = 0; index < negPatterns.length; index++) {
        const nglob = negPatterns[index];
        if (nglob(path6)) {
          return returnIndex ? -1 : false;
        }
      }
      const applied = isList && [path6].concat(args.slice(1));
      for (let index = 0; index < patterns.length; index++) {
        const pattern = patterns[index];
        if (isList ? pattern(...applied) : pattern(path6)) {
          return returnIndex ? index : true;
        }
      }
      return returnIndex ? -1 : false;
    };
    var anymatch = (matchers, testString, options = DEFAULT_OPTIONS) => {
      if (matchers == null) {
        throw new TypeError("anymatch: specify first argument");
      }
      const opts = typeof options === "boolean" ? { returnIndex: options } : options;
      const returnIndex = opts.returnIndex || false;
      const mtchers = arrify(matchers);
      const negatedGlobs = mtchers.filter((item) => typeof item === "string" && item.charAt(0) === BANG).map((item) => item.slice(1)).map((item) => picomatch(item, opts));
      const patterns = mtchers.filter((item) => typeof item !== "string" || typeof item === "string" && item.charAt(0) !== BANG).map((matcher) => createPattern(matcher, opts));
      if (testString == null) {
        return (testString2, ri = false) => {
          const returnIndex2 = typeof ri === "boolean" ? ri : false;
          return matchPatterns(patterns, negatedGlobs, testString2, returnIndex2);
        };
      }
      return matchPatterns(patterns, negatedGlobs, testString, returnIndex);
    };
    anymatch.default = anymatch;
    module2.exports = anymatch;
  }
});

// node_modules/is-extglob/index.js
var require_is_extglob = __commonJS({
  "node_modules/is-extglob/index.js"(exports2, module2) {
    module2.exports = function isExtglob(str) {
      if (typeof str !== "string" || str === "") {
        return false;
      }
      var match;
      while (match = /(\\).|([@?!+*]\(.*\))/g.exec(str)) {
        if (match[2]) return true;
        str = str.slice(match.index + match[0].length);
      }
      return false;
    };
  }
});

// node_modules/is-glob/index.js
var require_is_glob = __commonJS({
  "node_modules/is-glob/index.js"(exports2, module2) {
    var isExtglob = require_is_extglob();
    var chars = { "{": "}", "(": ")", "[": "]" };
    var strictCheck = function(str) {
      if (str[0] === "!") {
        return true;
      }
      var index = 0;
      var pipeIndex = -2;
      var closeSquareIndex = -2;
      var closeCurlyIndex = -2;
      var closeParenIndex = -2;
      var backSlashIndex = -2;
      while (index < str.length) {
        if (str[index] === "*") {
          return true;
        }
        if (str[index + 1] === "?" && /[\].+)]/.test(str[index])) {
          return true;
        }
        if (closeSquareIndex !== -1 && str[index] === "[" && str[index + 1] !== "]") {
          if (closeSquareIndex < index) {
            closeSquareIndex = str.indexOf("]", index);
          }
          if (closeSquareIndex > index) {
            if (backSlashIndex === -1 || backSlashIndex > closeSquareIndex) {
              return true;
            }
            backSlashIndex = str.indexOf("\\", index);
            if (backSlashIndex === -1 || backSlashIndex > closeSquareIndex) {
              return true;
            }
          }
        }
        if (closeCurlyIndex !== -1 && str[index] === "{" && str[index + 1] !== "}") {
          closeCurlyIndex = str.indexOf("}", index);
          if (closeCurlyIndex > index) {
            backSlashIndex = str.indexOf("\\", index);
            if (backSlashIndex === -1 || backSlashIndex > closeCurlyIndex) {
              return true;
            }
          }
        }
        if (closeParenIndex !== -1 && str[index] === "(" && str[index + 1] === "?" && /[:!=]/.test(str[index + 2]) && str[index + 3] !== ")") {
          closeParenIndex = str.indexOf(")", index);
          if (closeParenIndex > index) {
            backSlashIndex = str.indexOf("\\", index);
            if (backSlashIndex === -1 || backSlashIndex > closeParenIndex) {
              return true;
            }
          }
        }
        if (pipeIndex !== -1 && str[index] === "(" && str[index + 1] !== "|") {
          if (pipeIndex < index) {
            pipeIndex = str.indexOf("|", index);
          }
          if (pipeIndex !== -1 && str[pipeIndex + 1] !== ")") {
            closeParenIndex = str.indexOf(")", pipeIndex);
            if (closeParenIndex > pipeIndex) {
              backSlashIndex = str.indexOf("\\", pipeIndex);
              if (backSlashIndex === -1 || backSlashIndex > closeParenIndex) {
                return true;
              }
            }
          }
        }
        if (str[index] === "\\") {
          var open = str[index + 1];
          index += 2;
          var close = chars[open];
          if (close) {
            var n = str.indexOf(close, index);
            if (n !== -1) {
              index = n + 1;
            }
          }
          if (str[index] === "!") {
            return true;
          }
        } else {
          index++;
        }
      }
      return false;
    };
    var relaxedCheck = function(str) {
      if (str[0] === "!") {
        return true;
      }
      var index = 0;
      while (index < str.length) {
        if (/[*?{}()[\]]/.test(str[index])) {
          return true;
        }
        if (str[index] === "\\") {
          var open = str[index + 1];
          index += 2;
          var close = chars[open];
          if (close) {
            var n = str.indexOf(close, index);
            if (n !== -1) {
              index = n + 1;
            }
          }
          if (str[index] === "!") {
            return true;
          }
        } else {
          index++;
        }
      }
      return false;
    };
    module2.exports = function isGlob(str, options) {
      if (typeof str !== "string" || str === "") {
        return false;
      }
      if (isExtglob(str)) {
        return true;
      }
      var check = strictCheck;
      if (options && options.strict === false) {
        check = relaxedCheck;
      }
      return check(str);
    };
  }
});

// node_modules/glob-parent/index.js
var require_glob_parent = __commonJS({
  "node_modules/glob-parent/index.js"(exports2, module2) {
    "use strict";
    var isGlob = require_is_glob();
    var pathPosixDirname = require("path").posix.dirname;
    var isWin32 = require("os").platform() === "win32";
    var slash = "/";
    var backslash = /\\/g;
    var enclosure = /[\{\[].*[\}\]]$/;
    var globby = /(^|[^\\])([\{\[]|\([^\)]+$)/;
    var escaped = /\\([\!\*\?\|\[\]\(\)\{\}])/g;
    module2.exports = function globParent(str, opts) {
      var options = Object.assign({ flipBackslashes: true }, opts);
      if (options.flipBackslashes && isWin32 && str.indexOf(slash) < 0) {
        str = str.replace(backslash, slash);
      }
      if (enclosure.test(str)) {
        str += slash;
      }
      str += "a";
      do {
        str = pathPosixDirname(str);
      } while (isGlob(str) || globby.test(str));
      return str.replace(escaped, "$1");
    };
  }
});

// node_modules/braces/lib/utils.js
var require_utils2 = __commonJS({
  "node_modules/braces/lib/utils.js"(exports2) {
    "use strict";
    exports2.isInteger = (num) => {
      if (typeof num === "number") {
        return Number.isInteger(num);
      }
      if (typeof num === "string" && num.trim() !== "") {
        return Number.isInteger(Number(num));
      }
      return false;
    };
    exports2.find = (node, type) => node.nodes.find((node2) => node2.type === type);
    exports2.exceedsLimit = (min, max, step = 1, limit) => {
      if (limit === false) return false;
      if (!exports2.isInteger(min) || !exports2.isInteger(max)) return false;
      return (Number(max) - Number(min)) / Number(step) >= limit;
    };
    exports2.escapeNode = (block, n = 0, type) => {
      const node = block.nodes[n];
      if (!node) return;
      if (type && node.type === type || node.type === "open" || node.type === "close") {
        if (node.escaped !== true) {
          node.value = "\\" + node.value;
          node.escaped = true;
        }
      }
    };
    exports2.encloseBrace = (node) => {
      if (node.type !== "brace") return false;
      if (node.commas >> 0 + node.ranges >> 0 === 0) {
        node.invalid = true;
        return true;
      }
      return false;
    };
    exports2.isInvalidBrace = (block) => {
      if (block.type !== "brace") return false;
      if (block.invalid === true || block.dollar) return true;
      if (block.commas >> 0 + block.ranges >> 0 === 0) {
        block.invalid = true;
        return true;
      }
      if (block.open !== true || block.close !== true) {
        block.invalid = true;
        return true;
      }
      return false;
    };
    exports2.isOpenOrClose = (node) => {
      if (node.type === "open" || node.type === "close") {
        return true;
      }
      return node.open === true || node.close === true;
    };
    exports2.reduce = (nodes) => nodes.reduce((acc, node) => {
      if (node.type === "text") acc.push(node.value);
      if (node.type === "range") node.type = "text";
      return acc;
    }, []);
    exports2.flatten = (...args) => {
      const result = [];
      const flat = (arr) => {
        for (let i = 0; i < arr.length; i++) {
          const ele = arr[i];
          if (Array.isArray(ele)) {
            flat(ele);
            continue;
          }
          if (ele !== void 0) {
            result.push(ele);
          }
        }
        return result;
      };
      flat(args);
      return result;
    };
  }
});

// node_modules/braces/lib/stringify.js
var require_stringify = __commonJS({
  "node_modules/braces/lib/stringify.js"(exports2, module2) {
    "use strict";
    var utils = require_utils2();
    module2.exports = (ast, options = {}) => {
      const stringify = (node, parent = {}) => {
        const invalidBlock = options.escapeInvalid && utils.isInvalidBrace(parent);
        const invalidNode = node.invalid === true && options.escapeInvalid === true;
        let output = "";
        if (node.value) {
          if ((invalidBlock || invalidNode) && utils.isOpenOrClose(node)) {
            return "\\" + node.value;
          }
          return node.value;
        }
        if (node.value) {
          return node.value;
        }
        if (node.nodes) {
          for (const child of node.nodes) {
            output += stringify(child);
          }
        }
        return output;
      };
      return stringify(ast);
    };
  }
});

// node_modules/is-number/index.js
var require_is_number = __commonJS({
  "node_modules/is-number/index.js"(exports2, module2) {
    "use strict";
    module2.exports = function(num) {
      if (typeof num === "number") {
        return num - num === 0;
      }
      if (typeof num === "string" && num.trim() !== "") {
        return Number.isFinite ? Number.isFinite(+num) : isFinite(+num);
      }
      return false;
    };
  }
});

// node_modules/to-regex-range/index.js
var require_to_regex_range = __commonJS({
  "node_modules/to-regex-range/index.js"(exports2, module2) {
    "use strict";
    var isNumber = require_is_number();
    var toRegexRange = (min, max, options) => {
      if (isNumber(min) === false) {
        throw new TypeError("toRegexRange: expected the first argument to be a number");
      }
      if (max === void 0 || min === max) {
        return String(min);
      }
      if (isNumber(max) === false) {
        throw new TypeError("toRegexRange: expected the second argument to be a number.");
      }
      let opts = { relaxZeros: true, ...options };
      if (typeof opts.strictZeros === "boolean") {
        opts.relaxZeros = opts.strictZeros === false;
      }
      let relax = String(opts.relaxZeros);
      let shorthand = String(opts.shorthand);
      let capture = String(opts.capture);
      let wrap = String(opts.wrap);
      let cacheKey = min + ":" + max + "=" + relax + shorthand + capture + wrap;
      if (toRegexRange.cache.hasOwnProperty(cacheKey)) {
        return toRegexRange.cache[cacheKey].result;
      }
      let a = Math.min(min, max);
      let b = Math.max(min, max);
      if (Math.abs(a - b) === 1) {
        let result = min + "|" + max;
        if (opts.capture) {
          return `(${result})`;
        }
        if (opts.wrap === false) {
          return result;
        }
        return `(?:${result})`;
      }
      let isPadded = hasPadding(min) || hasPadding(max);
      let state = { min, max, a, b };
      let positives = [];
      let negatives = [];
      if (isPadded) {
        state.isPadded = isPadded;
        state.maxLen = String(state.max).length;
      }
      if (a < 0) {
        let newMin = b < 0 ? Math.abs(b) : 1;
        negatives = splitToPatterns(newMin, Math.abs(a), state, opts);
        a = state.a = 0;
      }
      if (b >= 0) {
        positives = splitToPatterns(a, b, state, opts);
      }
      state.negatives = negatives;
      state.positives = positives;
      state.result = collatePatterns(negatives, positives, opts);
      if (opts.capture === true) {
        state.result = `(${state.result})`;
      } else if (opts.wrap !== false && positives.length + negatives.length > 1) {
        state.result = `(?:${state.result})`;
      }
      toRegexRange.cache[cacheKey] = state;
      return state.result;
    };
    function collatePatterns(neg, pos, options) {
      let onlyNegative = filterPatterns(neg, pos, "-", false, options) || [];
      let onlyPositive = filterPatterns(pos, neg, "", false, options) || [];
      let intersected = filterPatterns(neg, pos, "-?", true, options) || [];
      let subpatterns = onlyNegative.concat(intersected).concat(onlyPositive);
      return subpatterns.join("|");
    }
    function splitToRanges(min, max) {
      let nines = 1;
      let zeros = 1;
      let stop = countNines(min, nines);
      let stops = /* @__PURE__ */ new Set([max]);
      while (min <= stop && stop <= max) {
        stops.add(stop);
        nines += 1;
        stop = countNines(min, nines);
      }
      stop = countZeros(max + 1, zeros) - 1;
      while (min < stop && stop <= max) {
        stops.add(stop);
        zeros += 1;
        stop = countZeros(max + 1, zeros) - 1;
      }
      stops = [...stops];
      stops.sort(compare);
      return stops;
    }
    function rangeToPattern(start, stop, options) {
      if (start === stop) {
        return { pattern: start, count: [], digits: 0 };
      }
      let zipped = zip(start, stop);
      let digits = zipped.length;
      let pattern = "";
      let count = 0;
      for (let i = 0; i < digits; i++) {
        let [startDigit, stopDigit] = zipped[i];
        if (startDigit === stopDigit) {
          pattern += startDigit;
        } else if (startDigit !== "0" || stopDigit !== "9") {
          pattern += toCharacterClass(startDigit, stopDigit, options);
        } else {
          count++;
        }
      }
      if (count) {
        pattern += options.shorthand === true ? "\\d" : "[0-9]";
      }
      return { pattern, count: [count], digits };
    }
    function splitToPatterns(min, max, tok, options) {
      let ranges = splitToRanges(min, max);
      let tokens = [];
      let start = min;
      let prev;
      for (let i = 0; i < ranges.length; i++) {
        let max2 = ranges[i];
        let obj = rangeToPattern(String(start), String(max2), options);
        let zeros = "";
        if (!tok.isPadded && prev && prev.pattern === obj.pattern) {
          if (prev.count.length > 1) {
            prev.count.pop();
          }
          prev.count.push(obj.count[0]);
          prev.string = prev.pattern + toQuantifier(prev.count);
          start = max2 + 1;
          continue;
        }
        if (tok.isPadded) {
          zeros = padZeros(max2, tok, options);
        }
        obj.string = zeros + obj.pattern + toQuantifier(obj.count);
        tokens.push(obj);
        start = max2 + 1;
        prev = obj;
      }
      return tokens;
    }
    function filterPatterns(arr, comparison, prefix, intersection, options) {
      let result = [];
      for (let ele of arr) {
        let { string } = ele;
        if (!intersection && !contains(comparison, "string", string)) {
          result.push(prefix + string);
        }
        if (intersection && contains(comparison, "string", string)) {
          result.push(prefix + string);
        }
      }
      return result;
    }
    function zip(a, b) {
      let arr = [];
      for (let i = 0; i < a.length; i++) arr.push([a[i], b[i]]);
      return arr;
    }
    function compare(a, b) {
      return a > b ? 1 : b > a ? -1 : 0;
    }
    function contains(arr, key, val) {
      return arr.some((ele) => ele[key] === val);
    }
    function countNines(min, len) {
      return Number(String(min).slice(0, -len) + "9".repeat(len));
    }
    function countZeros(integer, zeros) {
      return integer - integer % Math.pow(10, zeros);
    }
    function toQuantifier(digits) {
      let [start = 0, stop = ""] = digits;
      if (stop || start > 1) {
        return `{${start + (stop ? "," + stop : "")}}`;
      }
      return "";
    }
    function toCharacterClass(a, b, options) {
      return `[${a}${b - a === 1 ? "" : "-"}${b}]`;
    }
    function hasPadding(str) {
      return /^-?(0+)\d/.test(str);
    }
    function padZeros(value, tok, options) {
      if (!tok.isPadded) {
        return value;
      }
      let diff = Math.abs(tok.maxLen - String(value).length);
      let relax = options.relaxZeros !== false;
      switch (diff) {
        case 0:
          return "";
        case 1:
          return relax ? "0?" : "0";
        case 2:
          return relax ? "0{0,2}" : "00";
        default: {
          return relax ? `0{0,${diff}}` : `0{${diff}}`;
        }
      }
    }
    toRegexRange.cache = {};
    toRegexRange.clearCache = () => toRegexRange.cache = {};
    module2.exports = toRegexRange;
  }
});

// node_modules/fill-range/index.js
var require_fill_range = __commonJS({
  "node_modules/fill-range/index.js"(exports2, module2) {
    "use strict";
    var util = require("util");
    var toRegexRange = require_to_regex_range();
    var isObject = (val) => val !== null && typeof val === "object" && !Array.isArray(val);
    var transform = (toNumber) => {
      return (value) => toNumber === true ? Number(value) : String(value);
    };
    var isValidValue = (value) => {
      return typeof value === "number" || typeof value === "string" && value !== "";
    };
    var isNumber = (num) => Number.isInteger(+num);
    var zeros = (input) => {
      let value = `${input}`;
      let index = -1;
      if (value[0] === "-") value = value.slice(1);
      if (value === "0") return false;
      while (value[++index] === "0") ;
      return index > 0;
    };
    var stringify = (start, end, options) => {
      if (typeof start === "string" || typeof end === "string") {
        return true;
      }
      return options.stringify === true;
    };
    var pad = (input, maxLength, toNumber) => {
      if (maxLength > 0) {
        let dash = input[0] === "-" ? "-" : "";
        if (dash) input = input.slice(1);
        input = dash + input.padStart(dash ? maxLength - 1 : maxLength, "0");
      }
      if (toNumber === false) {
        return String(input);
      }
      return input;
    };
    var toMaxLen = (input, maxLength) => {
      let negative = input[0] === "-" ? "-" : "";
      if (negative) {
        input = input.slice(1);
        maxLength--;
      }
      while (input.length < maxLength) input = "0" + input;
      return negative ? "-" + input : input;
    };
    var toSequence = (parts, options, maxLen) => {
      parts.negatives.sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
      parts.positives.sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
      let prefix = options.capture ? "" : "?:";
      let positives = "";
      let negatives = "";
      let result;
      if (parts.positives.length) {
        positives = parts.positives.map((v) => toMaxLen(String(v), maxLen)).join("|");
      }
      if (parts.negatives.length) {
        negatives = `-(${prefix}${parts.negatives.map((v) => toMaxLen(String(v), maxLen)).join("|")})`;
      }
      if (positives && negatives) {
        result = `${positives}|${negatives}`;
      } else {
        result = positives || negatives;
      }
      if (options.wrap) {
        return `(${prefix}${result})`;
      }
      return result;
    };
    var toRange = (a, b, isNumbers, options) => {
      if (isNumbers) {
        return toRegexRange(a, b, { wrap: false, ...options });
      }
      let start = String.fromCharCode(a);
      if (a === b) return start;
      let stop = String.fromCharCode(b);
      return `[${start}-${stop}]`;
    };
    var toRegex = (start, end, options) => {
      if (Array.isArray(start)) {
        let wrap = options.wrap === true;
        let prefix = options.capture ? "" : "?:";
        return wrap ? `(${prefix}${start.join("|")})` : start.join("|");
      }
      return toRegexRange(start, end, options);
    };
    var rangeError = (...args) => {
      return new RangeError("Invalid range arguments: " + util.inspect(...args));
    };
    var invalidRange = (start, end, options) => {
      if (options.strictRanges === true) throw rangeError([start, end]);
      return [];
    };
    var invalidStep = (step, options) => {
      if (options.strictRanges === true) {
        throw new TypeError(`Expected step "${step}" to be a number`);
      }
      return [];
    };
    var fillNumbers = (start, end, step = 1, options = {}) => {
      let a = Number(start);
      let b = Number(end);
      if (!Number.isInteger(a) || !Number.isInteger(b)) {
        if (options.strictRanges === true) throw rangeError([start, end]);
        return [];
      }
      if (a === 0) a = 0;
      if (b === 0) b = 0;
      let descending = a > b;
      let startString = String(start);
      let endString = String(end);
      let stepString = String(step);
      step = Math.max(Math.abs(step), 1);
      let padded = zeros(startString) || zeros(endString) || zeros(stepString);
      let maxLen = padded ? Math.max(startString.length, endString.length, stepString.length) : 0;
      let toNumber = padded === false && stringify(start, end, options) === false;
      let format = options.transform || transform(toNumber);
      if (options.toRegex && step === 1) {
        return toRange(toMaxLen(start, maxLen), toMaxLen(end, maxLen), true, options);
      }
      let parts = { negatives: [], positives: [] };
      let push = (num) => parts[num < 0 ? "negatives" : "positives"].push(Math.abs(num));
      let range = [];
      let index = 0;
      while (descending ? a >= b : a <= b) {
        if (options.toRegex === true && step > 1) {
          push(a);
        } else {
          range.push(pad(format(a, index), maxLen, toNumber));
        }
        a = descending ? a - step : a + step;
        index++;
      }
      if (options.toRegex === true) {
        return step > 1 ? toSequence(parts, options, maxLen) : toRegex(range, null, { wrap: false, ...options });
      }
      return range;
    };
    var fillLetters = (start, end, step = 1, options = {}) => {
      if (!isNumber(start) && start.length > 1 || !isNumber(end) && end.length > 1) {
        return invalidRange(start, end, options);
      }
      let format = options.transform || ((val) => String.fromCharCode(val));
      let a = `${start}`.charCodeAt(0);
      let b = `${end}`.charCodeAt(0);
      let descending = a > b;
      let min = Math.min(a, b);
      let max = Math.max(a, b);
      if (options.toRegex && step === 1) {
        return toRange(min, max, false, options);
      }
      let range = [];
      let index = 0;
      while (descending ? a >= b : a <= b) {
        range.push(format(a, index));
        a = descending ? a - step : a + step;
        index++;
      }
      if (options.toRegex === true) {
        return toRegex(range, null, { wrap: false, options });
      }
      return range;
    };
    var fill = (start, end, step, options = {}) => {
      if (end == null && isValidValue(start)) {
        return [start];
      }
      if (!isValidValue(start) || !isValidValue(end)) {
        return invalidRange(start, end, options);
      }
      if (typeof step === "function") {
        return fill(start, end, 1, { transform: step });
      }
      if (isObject(step)) {
        return fill(start, end, 0, step);
      }
      let opts = { ...options };
      if (opts.capture === true) opts.wrap = true;
      step = step || opts.step || 1;
      if (!isNumber(step)) {
        if (step != null && !isObject(step)) return invalidStep(step, opts);
        return fill(start, end, 1, step);
      }
      if (isNumber(start) && isNumber(end)) {
        return fillNumbers(start, end, step, opts);
      }
      return fillLetters(start, end, Math.max(Math.abs(step), 1), opts);
    };
    module2.exports = fill;
  }
});

// node_modules/braces/lib/compile.js
var require_compile = __commonJS({
  "node_modules/braces/lib/compile.js"(exports2, module2) {
    "use strict";
    var fill = require_fill_range();
    var utils = require_utils2();
    var compile = (ast, options = {}) => {
      const walk = (node, parent = {}) => {
        const invalidBlock = utils.isInvalidBrace(parent);
        const invalidNode = node.invalid === true && options.escapeInvalid === true;
        const invalid = invalidBlock === true || invalidNode === true;
        const prefix = options.escapeInvalid === true ? "\\" : "";
        let output = "";
        if (node.isOpen === true) {
          return prefix + node.value;
        }
        if (node.isClose === true) {
          console.log("node.isClose", prefix, node.value);
          return prefix + node.value;
        }
        if (node.type === "open") {
          return invalid ? prefix + node.value : "(";
        }
        if (node.type === "close") {
          return invalid ? prefix + node.value : ")";
        }
        if (node.type === "comma") {
          return node.prev.type === "comma" ? "" : invalid ? node.value : "|";
        }
        if (node.value) {
          return node.value;
        }
        if (node.nodes && node.ranges > 0) {
          const args = utils.reduce(node.nodes);
          const range = fill(...args, { ...options, wrap: false, toRegex: true, strictZeros: true });
          if (range.length !== 0) {
            return args.length > 1 && range.length > 1 ? `(${range})` : range;
          }
        }
        if (node.nodes) {
          for (const child of node.nodes) {
            output += walk(child, node);
          }
        }
        return output;
      };
      return walk(ast);
    };
    module2.exports = compile;
  }
});

// node_modules/braces/lib/expand.js
var require_expand = __commonJS({
  "node_modules/braces/lib/expand.js"(exports2, module2) {
    "use strict";
    var fill = require_fill_range();
    var stringify = require_stringify();
    var utils = require_utils2();
    var append = (queue = "", stash = "", enclose = false) => {
      const result = [];
      queue = [].concat(queue);
      stash = [].concat(stash);
      if (!stash.length) return queue;
      if (!queue.length) {
        return enclose ? utils.flatten(stash).map((ele) => `{${ele}}`) : stash;
      }
      for (const item of queue) {
        if (Array.isArray(item)) {
          for (const value of item) {
            result.push(append(value, stash, enclose));
          }
        } else {
          for (let ele of stash) {
            if (enclose === true && typeof ele === "string") ele = `{${ele}}`;
            result.push(Array.isArray(ele) ? append(item, ele, enclose) : item + ele);
          }
        }
      }
      return utils.flatten(result);
    };
    var expand = (ast, options = {}) => {
      const rangeLimit = options.rangeLimit === void 0 ? 1e3 : options.rangeLimit;
      const walk = (node, parent = {}) => {
        node.queue = [];
        let p = parent;
        let q = parent.queue;
        while (p.type !== "brace" && p.type !== "root" && p.parent) {
          p = p.parent;
          q = p.queue;
        }
        if (node.invalid || node.dollar) {
          q.push(append(q.pop(), stringify(node, options)));
          return;
        }
        if (node.type === "brace" && node.invalid !== true && node.nodes.length === 2) {
          q.push(append(q.pop(), ["{}"]));
          return;
        }
        if (node.nodes && node.ranges > 0) {
          const args = utils.reduce(node.nodes);
          if (utils.exceedsLimit(...args, options.step, rangeLimit)) {
            throw new RangeError("expanded array length exceeds range limit. Use options.rangeLimit to increase or disable the limit.");
          }
          let range = fill(...args, options);
          if (range.length === 0) {
            range = stringify(node, options);
          }
          q.push(append(q.pop(), range));
          node.nodes = [];
          return;
        }
        const enclose = utils.encloseBrace(node);
        let queue = node.queue;
        let block = node;
        while (block.type !== "brace" && block.type !== "root" && block.parent) {
          block = block.parent;
          queue = block.queue;
        }
        for (let i = 0; i < node.nodes.length; i++) {
          const child = node.nodes[i];
          if (child.type === "comma" && node.type === "brace") {
            if (i === 1) queue.push("");
            queue.push("");
            continue;
          }
          if (child.type === "close") {
            q.push(append(q.pop(), queue, enclose));
            continue;
          }
          if (child.value && child.type !== "open") {
            queue.push(append(queue.pop(), child.value));
            continue;
          }
          if (child.nodes) {
            walk(child, node);
          }
        }
        return queue;
      };
      return utils.flatten(walk(ast));
    };
    module2.exports = expand;
  }
});

// node_modules/braces/lib/constants.js
var require_constants2 = __commonJS({
  "node_modules/braces/lib/constants.js"(exports2, module2) {
    "use strict";
    module2.exports = {
      MAX_LENGTH: 1e4,
      // Digits
      CHAR_0: "0",
      /* 0 */
      CHAR_9: "9",
      /* 9 */
      // Alphabet chars.
      CHAR_UPPERCASE_A: "A",
      /* A */
      CHAR_LOWERCASE_A: "a",
      /* a */
      CHAR_UPPERCASE_Z: "Z",
      /* Z */
      CHAR_LOWERCASE_Z: "z",
      /* z */
      CHAR_LEFT_PARENTHESES: "(",
      /* ( */
      CHAR_RIGHT_PARENTHESES: ")",
      /* ) */
      CHAR_ASTERISK: "*",
      /* * */
      // Non-alphabetic chars.
      CHAR_AMPERSAND: "&",
      /* & */
      CHAR_AT: "@",
      /* @ */
      CHAR_BACKSLASH: "\\",
      /* \ */
      CHAR_BACKTICK: "`",
      /* ` */
      CHAR_CARRIAGE_RETURN: "\r",
      /* \r */
      CHAR_CIRCUMFLEX_ACCENT: "^",
      /* ^ */
      CHAR_COLON: ":",
      /* : */
      CHAR_COMMA: ",",
      /* , */
      CHAR_DOLLAR: "$",
      /* . */
      CHAR_DOT: ".",
      /* . */
      CHAR_DOUBLE_QUOTE: '"',
      /* " */
      CHAR_EQUAL: "=",
      /* = */
      CHAR_EXCLAMATION_MARK: "!",
      /* ! */
      CHAR_FORM_FEED: "\f",
      /* \f */
      CHAR_FORWARD_SLASH: "/",
      /* / */
      CHAR_HASH: "#",
      /* # */
      CHAR_HYPHEN_MINUS: "-",
      /* - */
      CHAR_LEFT_ANGLE_BRACKET: "<",
      /* < */
      CHAR_LEFT_CURLY_BRACE: "{",
      /* { */
      CHAR_LEFT_SQUARE_BRACKET: "[",
      /* [ */
      CHAR_LINE_FEED: "\n",
      /* \n */
      CHAR_NO_BREAK_SPACE: "\xA0",
      /* \u00A0 */
      CHAR_PERCENT: "%",
      /* % */
      CHAR_PLUS: "+",
      /* + */
      CHAR_QUESTION_MARK: "?",
      /* ? */
      CHAR_RIGHT_ANGLE_BRACKET: ">",
      /* > */
      CHAR_RIGHT_CURLY_BRACE: "}",
      /* } */
      CHAR_RIGHT_SQUARE_BRACKET: "]",
      /* ] */
      CHAR_SEMICOLON: ";",
      /* ; */
      CHAR_SINGLE_QUOTE: "'",
      /* ' */
      CHAR_SPACE: " ",
      /*   */
      CHAR_TAB: "	",
      /* \t */
      CHAR_UNDERSCORE: "_",
      /* _ */
      CHAR_VERTICAL_LINE: "|",
      /* | */
      CHAR_ZERO_WIDTH_NOBREAK_SPACE: "\uFEFF"
      /* \uFEFF */
    };
  }
});

// node_modules/braces/lib/parse.js
var require_parse2 = __commonJS({
  "node_modules/braces/lib/parse.js"(exports2, module2) {
    "use strict";
    var stringify = require_stringify();
    var {
      MAX_LENGTH,
      CHAR_BACKSLASH,
      /* \ */
      CHAR_BACKTICK,
      /* ` */
      CHAR_COMMA,
      /* , */
      CHAR_DOT,
      /* . */
      CHAR_LEFT_PARENTHESES,
      /* ( */
      CHAR_RIGHT_PARENTHESES,
      /* ) */
      CHAR_LEFT_CURLY_BRACE,
      /* { */
      CHAR_RIGHT_CURLY_BRACE,
      /* } */
      CHAR_LEFT_SQUARE_BRACKET,
      /* [ */
      CHAR_RIGHT_SQUARE_BRACKET,
      /* ] */
      CHAR_DOUBLE_QUOTE,
      /* " */
      CHAR_SINGLE_QUOTE,
      /* ' */
      CHAR_NO_BREAK_SPACE,
      CHAR_ZERO_WIDTH_NOBREAK_SPACE
    } = require_constants2();
    var parse = (input, options = {}) => {
      if (typeof input !== "string") {
        throw new TypeError("Expected a string");
      }
      const opts = options || {};
      const max = typeof opts.maxLength === "number" ? Math.min(MAX_LENGTH, opts.maxLength) : MAX_LENGTH;
      if (input.length > max) {
        throw new SyntaxError(`Input length (${input.length}), exceeds max characters (${max})`);
      }
      const ast = { type: "root", input, nodes: [] };
      const stack = [ast];
      let block = ast;
      let prev = ast;
      let brackets = 0;
      const length = input.length;
      let index = 0;
      let depth = 0;
      let value;
      const advance = () => input[index++];
      const push = (node) => {
        if (node.type === "text" && prev.type === "dot") {
          prev.type = "text";
        }
        if (prev && prev.type === "text" && node.type === "text") {
          prev.value += node.value;
          return;
        }
        block.nodes.push(node);
        node.parent = block;
        node.prev = prev;
        prev = node;
        return node;
      };
      push({ type: "bos" });
      while (index < length) {
        block = stack[stack.length - 1];
        value = advance();
        if (value === CHAR_ZERO_WIDTH_NOBREAK_SPACE || value === CHAR_NO_BREAK_SPACE) {
          continue;
        }
        if (value === CHAR_BACKSLASH) {
          push({ type: "text", value: (options.keepEscaping ? value : "") + advance() });
          continue;
        }
        if (value === CHAR_RIGHT_SQUARE_BRACKET) {
          push({ type: "text", value: "\\" + value });
          continue;
        }
        if (value === CHAR_LEFT_SQUARE_BRACKET) {
          brackets++;
          let next;
          while (index < length && (next = advance())) {
            value += next;
            if (next === CHAR_LEFT_SQUARE_BRACKET) {
              brackets++;
              continue;
            }
            if (next === CHAR_BACKSLASH) {
              value += advance();
              continue;
            }
            if (next === CHAR_RIGHT_SQUARE_BRACKET) {
              brackets--;
              if (brackets === 0) {
                break;
              }
            }
          }
          push({ type: "text", value });
          continue;
        }
        if (value === CHAR_LEFT_PARENTHESES) {
          block = push({ type: "paren", nodes: [] });
          stack.push(block);
          push({ type: "text", value });
          continue;
        }
        if (value === CHAR_RIGHT_PARENTHESES) {
          if (block.type !== "paren") {
            push({ type: "text", value });
            continue;
          }
          block = stack.pop();
          push({ type: "text", value });
          block = stack[stack.length - 1];
          continue;
        }
        if (value === CHAR_DOUBLE_QUOTE || value === CHAR_SINGLE_QUOTE || value === CHAR_BACKTICK) {
          const open = value;
          let next;
          if (options.keepQuotes !== true) {
            value = "";
          }
          while (index < length && (next = advance())) {
            if (next === CHAR_BACKSLASH) {
              value += next + advance();
              continue;
            }
            if (next === open) {
              if (options.keepQuotes === true) value += next;
              break;
            }
            value += next;
          }
          push({ type: "text", value });
          continue;
        }
        if (value === CHAR_LEFT_CURLY_BRACE) {
          depth++;
          const dollar = prev.value && prev.value.slice(-1) === "$" || block.dollar === true;
          const brace = {
            type: "brace",
            open: true,
            close: false,
            dollar,
            depth,
            commas: 0,
            ranges: 0,
            nodes: []
          };
          block = push(brace);
          stack.push(block);
          push({ type: "open", value });
          continue;
        }
        if (value === CHAR_RIGHT_CURLY_BRACE) {
          if (block.type !== "brace") {
            push({ type: "text", value });
            continue;
          }
          const type = "close";
          block = stack.pop();
          block.close = true;
          push({ type, value });
          depth--;
          block = stack[stack.length - 1];
          continue;
        }
        if (value === CHAR_COMMA && depth > 0) {
          if (block.ranges > 0) {
            block.ranges = 0;
            const open = block.nodes.shift();
            block.nodes = [open, { type: "text", value: stringify(block) }];
          }
          push({ type: "comma", value });
          block.commas++;
          continue;
        }
        if (value === CHAR_DOT && depth > 0 && block.commas === 0) {
          const siblings = block.nodes;
          if (depth === 0 || siblings.length === 0) {
            push({ type: "text", value });
            continue;
          }
          if (prev.type === "dot") {
            block.range = [];
            prev.value += value;
            prev.type = "range";
            if (block.nodes.length !== 3 && block.nodes.length !== 5) {
              block.invalid = true;
              block.ranges = 0;
              prev.type = "text";
              continue;
            }
            block.ranges++;
            block.args = [];
            continue;
          }
          if (prev.type === "range") {
            siblings.pop();
            const before = siblings[siblings.length - 1];
            before.value += prev.value + value;
            prev = before;
            block.ranges--;
            continue;
          }
          push({ type: "dot", value });
          continue;
        }
        push({ type: "text", value });
      }
      do {
        block = stack.pop();
        if (block.type !== "root") {
          block.nodes.forEach((node) => {
            if (!node.nodes) {
              if (node.type === "open") node.isOpen = true;
              if (node.type === "close") node.isClose = true;
              if (!node.nodes) node.type = "text";
              node.invalid = true;
            }
          });
          const parent = stack[stack.length - 1];
          const index2 = parent.nodes.indexOf(block);
          parent.nodes.splice(index2, 1, ...block.nodes);
        }
      } while (stack.length > 0);
      push({ type: "eos" });
      return ast;
    };
    module2.exports = parse;
  }
});

// node_modules/braces/index.js
var require_braces = __commonJS({
  "node_modules/braces/index.js"(exports2, module2) {
    "use strict";
    var stringify = require_stringify();
    var compile = require_compile();
    var expand = require_expand();
    var parse = require_parse2();
    var braces = (input, options = {}) => {
      let output = [];
      if (Array.isArray(input)) {
        for (const pattern of input) {
          const result = braces.create(pattern, options);
          if (Array.isArray(result)) {
            output.push(...result);
          } else {
            output.push(result);
          }
        }
      } else {
        output = [].concat(braces.create(input, options));
      }
      if (options && options.expand === true && options.nodupes === true) {
        output = [...new Set(output)];
      }
      return output;
    };
    braces.parse = (input, options = {}) => parse(input, options);
    braces.stringify = (input, options = {}) => {
      if (typeof input === "string") {
        return stringify(braces.parse(input, options), options);
      }
      return stringify(input, options);
    };
    braces.compile = (input, options = {}) => {
      if (typeof input === "string") {
        input = braces.parse(input, options);
      }
      return compile(input, options);
    };
    braces.expand = (input, options = {}) => {
      if (typeof input === "string") {
        input = braces.parse(input, options);
      }
      let result = expand(input, options);
      if (options.noempty === true) {
        result = result.filter(Boolean);
      }
      if (options.nodupes === true) {
        result = [...new Set(result)];
      }
      return result;
    };
    braces.create = (input, options = {}) => {
      if (input === "" || input.length < 3) {
        return [input];
      }
      return options.expand !== true ? braces.compile(input, options) : braces.expand(input, options);
    };
    module2.exports = braces;
  }
});

// node_modules/binary-extensions/binary-extensions.json
var require_binary_extensions = __commonJS({
  "node_modules/binary-extensions/binary-extensions.json"(exports2, module2) {
    module2.exports = [
      "3dm",
      "3ds",
      "3g2",
      "3gp",
      "7z",
      "a",
      "aac",
      "adp",
      "afdesign",
      "afphoto",
      "afpub",
      "ai",
      "aif",
      "aiff",
      "alz",
      "ape",
      "apk",
      "appimage",
      "ar",
      "arj",
      "asf",
      "au",
      "avi",
      "bak",
      "baml",
      "bh",
      "bin",
      "bk",
      "bmp",
      "btif",
      "bz2",
      "bzip2",
      "cab",
      "caf",
      "cgm",
      "class",
      "cmx",
      "cpio",
      "cr2",
      "cur",
      "dat",
      "dcm",
      "deb",
      "dex",
      "djvu",
      "dll",
      "dmg",
      "dng",
      "doc",
      "docm",
      "docx",
      "dot",
      "dotm",
      "dra",
      "DS_Store",
      "dsk",
      "dts",
      "dtshd",
      "dvb",
      "dwg",
      "dxf",
      "ecelp4800",
      "ecelp7470",
      "ecelp9600",
      "egg",
      "eol",
      "eot",
      "epub",
      "exe",
      "f4v",
      "fbs",
      "fh",
      "fla",
      "flac",
      "flatpak",
      "fli",
      "flv",
      "fpx",
      "fst",
      "fvt",
      "g3",
      "gh",
      "gif",
      "graffle",
      "gz",
      "gzip",
      "h261",
      "h263",
      "h264",
      "icns",
      "ico",
      "ief",
      "img",
      "ipa",
      "iso",
      "jar",
      "jpeg",
      "jpg",
      "jpgv",
      "jpm",
      "jxr",
      "key",
      "ktx",
      "lha",
      "lib",
      "lvp",
      "lz",
      "lzh",
      "lzma",
      "lzo",
      "m3u",
      "m4a",
      "m4v",
      "mar",
      "mdi",
      "mht",
      "mid",
      "midi",
      "mj2",
      "mka",
      "mkv",
      "mmr",
      "mng",
      "mobi",
      "mov",
      "movie",
      "mp3",
      "mp4",
      "mp4a",
      "mpeg",
      "mpg",
      "mpga",
      "mxu",
      "nef",
      "npx",
      "numbers",
      "nupkg",
      "o",
      "odp",
      "ods",
      "odt",
      "oga",
      "ogg",
      "ogv",
      "otf",
      "ott",
      "pages",
      "pbm",
      "pcx",
      "pdb",
      "pdf",
      "pea",
      "pgm",
      "pic",
      "png",
      "pnm",
      "pot",
      "potm",
      "potx",
      "ppa",
      "ppam",
      "ppm",
      "pps",
      "ppsm",
      "ppsx",
      "ppt",
      "pptm",
      "pptx",
      "psd",
      "pya",
      "pyc",
      "pyo",
      "pyv",
      "qt",
      "rar",
      "ras",
      "raw",
      "resources",
      "rgb",
      "rip",
      "rlc",
      "rmf",
      "rmvb",
      "rpm",
      "rtf",
      "rz",
      "s3m",
      "s7z",
      "scpt",
      "sgi",
      "shar",
      "snap",
      "sil",
      "sketch",
      "slk",
      "smv",
      "snk",
      "so",
      "stl",
      "suo",
      "sub",
      "swf",
      "tar",
      "tbz",
      "tbz2",
      "tga",
      "tgz",
      "thmx",
      "tif",
      "tiff",
      "tlz",
      "ttc",
      "ttf",
      "txz",
      "udf",
      "uvh",
      "uvi",
      "uvm",
      "uvp",
      "uvs",
      "uvu",
      "viv",
      "vob",
      "war",
      "wav",
      "wax",
      "wbmp",
      "wdp",
      "weba",
      "webm",
      "webp",
      "whl",
      "wim",
      "wm",
      "wma",
      "wmv",
      "wmx",
      "woff",
      "woff2",
      "wrm",
      "wvx",
      "xbm",
      "xif",
      "xla",
      "xlam",
      "xls",
      "xlsb",
      "xlsm",
      "xlsx",
      "xlt",
      "xltm",
      "xltx",
      "xm",
      "xmind",
      "xpi",
      "xpm",
      "xwd",
      "xz",
      "z",
      "zip",
      "zipx"
    ];
  }
});

// node_modules/binary-extensions/index.js
var require_binary_extensions2 = __commonJS({
  "node_modules/binary-extensions/index.js"(exports2, module2) {
    module2.exports = require_binary_extensions();
  }
});

// node_modules/is-binary-path/index.js
var require_is_binary_path = __commonJS({
  "node_modules/is-binary-path/index.js"(exports2, module2) {
    "use strict";
    var path6 = require("path");
    var binaryExtensions = require_binary_extensions2();
    var extensions2 = new Set(binaryExtensions);
    module2.exports = (filePath) => extensions2.has(path6.extname(filePath).slice(1).toLowerCase());
  }
});

// node_modules/chokidar/lib/constants.js
var require_constants3 = __commonJS({
  "node_modules/chokidar/lib/constants.js"(exports2) {
    "use strict";
    var { sep } = require("path");
    var { platform } = process;
    var os = require("os");
    exports2.EV_ALL = "all";
    exports2.EV_READY = "ready";
    exports2.EV_ADD = "add";
    exports2.EV_CHANGE = "change";
    exports2.EV_ADD_DIR = "addDir";
    exports2.EV_UNLINK = "unlink";
    exports2.EV_UNLINK_DIR = "unlinkDir";
    exports2.EV_RAW = "raw";
    exports2.EV_ERROR = "error";
    exports2.STR_DATA = "data";
    exports2.STR_END = "end";
    exports2.STR_CLOSE = "close";
    exports2.FSEVENT_CREATED = "created";
    exports2.FSEVENT_MODIFIED = "modified";
    exports2.FSEVENT_DELETED = "deleted";
    exports2.FSEVENT_MOVED = "moved";
    exports2.FSEVENT_CLONED = "cloned";
    exports2.FSEVENT_UNKNOWN = "unknown";
    exports2.FSEVENT_FLAG_MUST_SCAN_SUBDIRS = 1;
    exports2.FSEVENT_TYPE_FILE = "file";
    exports2.FSEVENT_TYPE_DIRECTORY = "directory";
    exports2.FSEVENT_TYPE_SYMLINK = "symlink";
    exports2.KEY_LISTENERS = "listeners";
    exports2.KEY_ERR = "errHandlers";
    exports2.KEY_RAW = "rawEmitters";
    exports2.HANDLER_KEYS = [exports2.KEY_LISTENERS, exports2.KEY_ERR, exports2.KEY_RAW];
    exports2.DOT_SLASH = `.${sep}`;
    exports2.BACK_SLASH_RE = /\\/g;
    exports2.DOUBLE_SLASH_RE = /\/\//;
    exports2.SLASH_OR_BACK_SLASH_RE = /[/\\]/;
    exports2.DOT_RE = /\..*\.(sw[px])$|~$|\.subl.*\.tmp/;
    exports2.REPLACER_RE = /^\.[/\\]/;
    exports2.SLASH = "/";
    exports2.SLASH_SLASH = "//";
    exports2.BRACE_START = "{";
    exports2.BANG = "!";
    exports2.ONE_DOT = ".";
    exports2.TWO_DOTS = "..";
    exports2.STAR = "*";
    exports2.GLOBSTAR = "**";
    exports2.ROOT_GLOBSTAR = "/**/*";
    exports2.SLASH_GLOBSTAR = "/**";
    exports2.DIR_SUFFIX = "Dir";
    exports2.ANYMATCH_OPTS = { dot: true };
    exports2.STRING_TYPE = "string";
    exports2.FUNCTION_TYPE = "function";
    exports2.EMPTY_STR = "";
    exports2.EMPTY_FN = () => {
    };
    exports2.IDENTITY_FN = (val) => val;
    exports2.isWindows = platform === "win32";
    exports2.isMacos = platform === "darwin";
    exports2.isLinux = platform === "linux";
    exports2.isIBMi = os.type() === "OS400";
  }
});

// node_modules/chokidar/lib/nodefs-handler.js
var require_nodefs_handler = __commonJS({
  "node_modules/chokidar/lib/nodefs-handler.js"(exports2, module2) {
    "use strict";
    var fs2 = require("fs");
    var sysPath = require("path");
    var { promisify } = require("util");
    var isBinaryPath = require_is_binary_path();
    var {
      isWindows,
      isLinux,
      EMPTY_FN,
      EMPTY_STR,
      KEY_LISTENERS,
      KEY_ERR,
      KEY_RAW,
      HANDLER_KEYS,
      EV_CHANGE,
      EV_ADD,
      EV_ADD_DIR,
      EV_ERROR,
      STR_DATA,
      STR_END,
      BRACE_START,
      STAR
    } = require_constants3();
    var THROTTLE_MODE_WATCH = "watch";
    var open = promisify(fs2.open);
    var stat = promisify(fs2.stat);
    var lstat = promisify(fs2.lstat);
    var close = promisify(fs2.close);
    var fsrealpath = promisify(fs2.realpath);
    var statMethods = { lstat, stat };
    var foreach = (val, fn) => {
      if (val instanceof Set) {
        val.forEach(fn);
      } else {
        fn(val);
      }
    };
    var addAndConvert = (main, prop, item) => {
      let container = main[prop];
      if (!(container instanceof Set)) {
        main[prop] = container = /* @__PURE__ */ new Set([container]);
      }
      container.add(item);
    };
    var clearItem = (cont) => (key) => {
      const set = cont[key];
      if (set instanceof Set) {
        set.clear();
      } else {
        delete cont[key];
      }
    };
    var delFromSet = (main, prop, item) => {
      const container = main[prop];
      if (container instanceof Set) {
        container.delete(item);
      } else if (container === item) {
        delete main[prop];
      }
    };
    var isEmptySet = (val) => val instanceof Set ? val.size === 0 : !val;
    var FsWatchInstances = /* @__PURE__ */ new Map();
    function createFsWatchInstance(path6, options, listener, errHandler, emitRaw) {
      const handleEvent = (rawEvent, evPath) => {
        listener(path6);
        emitRaw(rawEvent, evPath, { watchedPath: path6 });
        if (evPath && path6 !== evPath) {
          fsWatchBroadcast(
            sysPath.resolve(path6, evPath),
            KEY_LISTENERS,
            sysPath.join(path6, evPath)
          );
        }
      };
      try {
        return fs2.watch(path6, options, handleEvent);
      } catch (error) {
        errHandler(error);
      }
    }
    var fsWatchBroadcast = (fullPath, type, val1, val2, val3) => {
      const cont = FsWatchInstances.get(fullPath);
      if (!cont) return;
      foreach(cont[type], (listener) => {
        listener(val1, val2, val3);
      });
    };
    var setFsWatchListener = (path6, fullPath, options, handlers) => {
      const { listener, errHandler, rawEmitter } = handlers;
      let cont = FsWatchInstances.get(fullPath);
      let watcher;
      if (!options.persistent) {
        watcher = createFsWatchInstance(
          path6,
          options,
          listener,
          errHandler,
          rawEmitter
        );
        return watcher.close.bind(watcher);
      }
      if (cont) {
        addAndConvert(cont, KEY_LISTENERS, listener);
        addAndConvert(cont, KEY_ERR, errHandler);
        addAndConvert(cont, KEY_RAW, rawEmitter);
      } else {
        watcher = createFsWatchInstance(
          path6,
          options,
          fsWatchBroadcast.bind(null, fullPath, KEY_LISTENERS),
          errHandler,
          // no need to use broadcast here
          fsWatchBroadcast.bind(null, fullPath, KEY_RAW)
        );
        if (!watcher) return;
        watcher.on(EV_ERROR, async (error) => {
          const broadcastErr = fsWatchBroadcast.bind(null, fullPath, KEY_ERR);
          cont.watcherUnusable = true;
          if (isWindows && error.code === "EPERM") {
            try {
              const fd = await open(path6, "r");
              await close(fd);
              broadcastErr(error);
            } catch (err) {
            }
          } else {
            broadcastErr(error);
          }
        });
        cont = {
          listeners: listener,
          errHandlers: errHandler,
          rawEmitters: rawEmitter,
          watcher
        };
        FsWatchInstances.set(fullPath, cont);
      }
      return () => {
        delFromSet(cont, KEY_LISTENERS, listener);
        delFromSet(cont, KEY_ERR, errHandler);
        delFromSet(cont, KEY_RAW, rawEmitter);
        if (isEmptySet(cont.listeners)) {
          cont.watcher.close();
          FsWatchInstances.delete(fullPath);
          HANDLER_KEYS.forEach(clearItem(cont));
          cont.watcher = void 0;
          Object.freeze(cont);
        }
      };
    };
    var FsWatchFileInstances = /* @__PURE__ */ new Map();
    var setFsWatchFileListener = (path6, fullPath, options, handlers) => {
      const { listener, rawEmitter } = handlers;
      let cont = FsWatchFileInstances.get(fullPath);
      let listeners = /* @__PURE__ */ new Set();
      let rawEmitters = /* @__PURE__ */ new Set();
      const copts = cont && cont.options;
      if (copts && (copts.persistent < options.persistent || copts.interval > options.interval)) {
        listeners = cont.listeners;
        rawEmitters = cont.rawEmitters;
        fs2.unwatchFile(fullPath);
        cont = void 0;
      }
      if (cont) {
        addAndConvert(cont, KEY_LISTENERS, listener);
        addAndConvert(cont, KEY_RAW, rawEmitter);
      } else {
        cont = {
          listeners: listener,
          rawEmitters: rawEmitter,
          options,
          watcher: fs2.watchFile(fullPath, options, (curr, prev) => {
            foreach(cont.rawEmitters, (rawEmitter2) => {
              rawEmitter2(EV_CHANGE, fullPath, { curr, prev });
            });
            const currmtime = curr.mtimeMs;
            if (curr.size !== prev.size || currmtime > prev.mtimeMs || currmtime === 0) {
              foreach(cont.listeners, (listener2) => listener2(path6, curr));
            }
          })
        };
        FsWatchFileInstances.set(fullPath, cont);
      }
      return () => {
        delFromSet(cont, KEY_LISTENERS, listener);
        delFromSet(cont, KEY_RAW, rawEmitter);
        if (isEmptySet(cont.listeners)) {
          FsWatchFileInstances.delete(fullPath);
          fs2.unwatchFile(fullPath);
          cont.options = cont.watcher = void 0;
          Object.freeze(cont);
        }
      };
    };
    var NodeFsHandler = class {
      /**
       * @param {import("../index").FSWatcher} fsW
       */
      constructor(fsW) {
        this.fsw = fsW;
        this._boundHandleError = (error) => fsW._handleError(error);
      }
      /**
       * Watch file for changes with fs_watchFile or fs_watch.
       * @param {String} path to file or dir
       * @param {Function} listener on fs change
       * @returns {Function} closer for the watcher instance
       */
      _watchWithNodeFs(path6, listener) {
        const opts = this.fsw.options;
        const directory = sysPath.dirname(path6);
        const basename4 = sysPath.basename(path6);
        const parent = this.fsw._getWatchedDir(directory);
        parent.add(basename4);
        const absolutePath = sysPath.resolve(path6);
        const options = { persistent: opts.persistent };
        if (!listener) listener = EMPTY_FN;
        let closer;
        if (opts.usePolling) {
          options.interval = opts.enableBinaryInterval && isBinaryPath(basename4) ? opts.binaryInterval : opts.interval;
          closer = setFsWatchFileListener(path6, absolutePath, options, {
            listener,
            rawEmitter: this.fsw._emitRaw
          });
        } else {
          closer = setFsWatchListener(path6, absolutePath, options, {
            listener,
            errHandler: this._boundHandleError,
            rawEmitter: this.fsw._emitRaw
          });
        }
        return closer;
      }
      /**
       * Watch a file and emit add event if warranted.
       * @param {Path} file Path
       * @param {fs.Stats} stats result of fs_stat
       * @param {Boolean} initialAdd was the file added at watch instantiation?
       * @returns {Function} closer for the watcher instance
       */
      _handleFile(file, stats, initialAdd) {
        if (this.fsw.closed) {
          return;
        }
        const dirname2 = sysPath.dirname(file);
        const basename4 = sysPath.basename(file);
        const parent = this.fsw._getWatchedDir(dirname2);
        let prevStats = stats;
        if (parent.has(basename4)) return;
        const listener = async (path6, newStats) => {
          if (!this.fsw._throttle(THROTTLE_MODE_WATCH, file, 5)) return;
          if (!newStats || newStats.mtimeMs === 0) {
            try {
              const newStats2 = await stat(file);
              if (this.fsw.closed) return;
              const at = newStats2.atimeMs;
              const mt = newStats2.mtimeMs;
              if (!at || at <= mt || mt !== prevStats.mtimeMs) {
                this.fsw._emit(EV_CHANGE, file, newStats2);
              }
              if (isLinux && prevStats.ino !== newStats2.ino) {
                this.fsw._closeFile(path6);
                prevStats = newStats2;
                this.fsw._addPathCloser(path6, this._watchWithNodeFs(file, listener));
              } else {
                prevStats = newStats2;
              }
            } catch (error) {
              this.fsw._remove(dirname2, basename4);
            }
          } else if (parent.has(basename4)) {
            const at = newStats.atimeMs;
            const mt = newStats.mtimeMs;
            if (!at || at <= mt || mt !== prevStats.mtimeMs) {
              this.fsw._emit(EV_CHANGE, file, newStats);
            }
            prevStats = newStats;
          }
        };
        const closer = this._watchWithNodeFs(file, listener);
        if (!(initialAdd && this.fsw.options.ignoreInitial) && this.fsw._isntIgnored(file)) {
          if (!this.fsw._throttle(EV_ADD, file, 0)) return;
          this.fsw._emit(EV_ADD, file, stats);
        }
        return closer;
      }
      /**
       * Handle symlinks encountered while reading a dir.
       * @param {Object} entry returned by readdirp
       * @param {String} directory path of dir being read
       * @param {String} path of this item
       * @param {String} item basename of this item
       * @returns {Promise<Boolean>} true if no more processing is needed for this entry.
       */
      async _handleSymlink(entry, directory, path6, item) {
        if (this.fsw.closed) {
          return;
        }
        const full = entry.fullPath;
        const dir = this.fsw._getWatchedDir(directory);
        if (!this.fsw.options.followSymlinks) {
          this.fsw._incrReadyCount();
          let linkPath;
          try {
            linkPath = await fsrealpath(path6);
          } catch (e) {
            this.fsw._emitReady();
            return true;
          }
          if (this.fsw.closed) return;
          if (dir.has(item)) {
            if (this.fsw._symlinkPaths.get(full) !== linkPath) {
              this.fsw._symlinkPaths.set(full, linkPath);
              this.fsw._emit(EV_CHANGE, path6, entry.stats);
            }
          } else {
            dir.add(item);
            this.fsw._symlinkPaths.set(full, linkPath);
            this.fsw._emit(EV_ADD, path6, entry.stats);
          }
          this.fsw._emitReady();
          return true;
        }
        if (this.fsw._symlinkPaths.has(full)) {
          return true;
        }
        this.fsw._symlinkPaths.set(full, true);
      }
      _handleRead(directory, initialAdd, wh, target, dir, depth, throttler) {
        directory = sysPath.join(directory, EMPTY_STR);
        if (!wh.hasGlob) {
          throttler = this.fsw._throttle("readdir", directory, 1e3);
          if (!throttler) return;
        }
        const previous = this.fsw._getWatchedDir(wh.path);
        const current = /* @__PURE__ */ new Set();
        let stream = this.fsw._readdirp(directory, {
          fileFilter: (entry) => wh.filterPath(entry),
          directoryFilter: (entry) => wh.filterDir(entry),
          depth: 0
        }).on(STR_DATA, async (entry) => {
          if (this.fsw.closed) {
            stream = void 0;
            return;
          }
          const item = entry.path;
          let path6 = sysPath.join(directory, item);
          current.add(item);
          if (entry.stats.isSymbolicLink() && await this._handleSymlink(entry, directory, path6, item)) {
            return;
          }
          if (this.fsw.closed) {
            stream = void 0;
            return;
          }
          if (item === target || !target && !previous.has(item)) {
            this.fsw._incrReadyCount();
            path6 = sysPath.join(dir, sysPath.relative(dir, path6));
            this._addToNodeFs(path6, initialAdd, wh, depth + 1);
          }
        }).on(EV_ERROR, this._boundHandleError);
        return new Promise(
          (resolve) => stream.once(STR_END, () => {
            if (this.fsw.closed) {
              stream = void 0;
              return;
            }
            const wasThrottled = throttler ? throttler.clear() : false;
            resolve();
            previous.getChildren().filter((item) => {
              return item !== directory && !current.has(item) && // in case of intersecting globs;
              // a path may have been filtered out of this readdir, but
              // shouldn't be removed because it matches a different glob
              (!wh.hasGlob || wh.filterPath({
                fullPath: sysPath.resolve(directory, item)
              }));
            }).forEach((item) => {
              this.fsw._remove(directory, item);
            });
            stream = void 0;
            if (wasThrottled) this._handleRead(directory, false, wh, target, dir, depth, throttler);
          })
        );
      }
      /**
       * Read directory to add / remove files from `@watched` list and re-read it on change.
       * @param {String} dir fs path
       * @param {fs.Stats} stats
       * @param {Boolean} initialAdd
       * @param {Number} depth relative to user-supplied path
       * @param {String} target child path targeted for watch
       * @param {Object} wh Common watch helpers for this path
       * @param {String} realpath
       * @returns {Promise<Function>} closer for the watcher instance.
       */
      async _handleDir(dir, stats, initialAdd, depth, target, wh, realpath) {
        const parentDir = this.fsw._getWatchedDir(sysPath.dirname(dir));
        const tracked = parentDir.has(sysPath.basename(dir));
        if (!(initialAdd && this.fsw.options.ignoreInitial) && !target && !tracked) {
          if (!wh.hasGlob || wh.globFilter(dir)) this.fsw._emit(EV_ADD_DIR, dir, stats);
        }
        parentDir.add(sysPath.basename(dir));
        this.fsw._getWatchedDir(dir);
        let throttler;
        let closer;
        const oDepth = this.fsw.options.depth;
        if ((oDepth == null || depth <= oDepth) && !this.fsw._symlinkPaths.has(realpath)) {
          if (!target) {
            await this._handleRead(dir, initialAdd, wh, target, dir, depth, throttler);
            if (this.fsw.closed) return;
          }
          closer = this._watchWithNodeFs(dir, (dirPath, stats2) => {
            if (stats2 && stats2.mtimeMs === 0) return;
            this._handleRead(dirPath, false, wh, target, dir, depth, throttler);
          });
        }
        return closer;
      }
      /**
       * Handle added file, directory, or glob pattern.
       * Delegates call to _handleFile / _handleDir after checks.
       * @param {String} path to file or ir
       * @param {Boolean} initialAdd was the file added at watch instantiation?
       * @param {Object} priorWh depth relative to user-supplied path
       * @param {Number} depth Child path actually targeted for watch
       * @param {String=} target Child path actually targeted for watch
       * @returns {Promise}
       */
      async _addToNodeFs(path6, initialAdd, priorWh, depth, target) {
        const ready = this.fsw._emitReady;
        if (this.fsw._isIgnored(path6) || this.fsw.closed) {
          ready();
          return false;
        }
        const wh = this.fsw._getWatchHelpers(path6, depth);
        if (!wh.hasGlob && priorWh) {
          wh.hasGlob = priorWh.hasGlob;
          wh.globFilter = priorWh.globFilter;
          wh.filterPath = (entry) => priorWh.filterPath(entry);
          wh.filterDir = (entry) => priorWh.filterDir(entry);
        }
        try {
          const stats = await statMethods[wh.statMethod](wh.watchPath);
          if (this.fsw.closed) return;
          if (this.fsw._isIgnored(wh.watchPath, stats)) {
            ready();
            return false;
          }
          const follow = this.fsw.options.followSymlinks && !path6.includes(STAR) && !path6.includes(BRACE_START);
          let closer;
          if (stats.isDirectory()) {
            const absPath = sysPath.resolve(path6);
            const targetPath = follow ? await fsrealpath(path6) : path6;
            if (this.fsw.closed) return;
            closer = await this._handleDir(wh.watchPath, stats, initialAdd, depth, target, wh, targetPath);
            if (this.fsw.closed) return;
            if (absPath !== targetPath && targetPath !== void 0) {
              this.fsw._symlinkPaths.set(absPath, targetPath);
            }
          } else if (stats.isSymbolicLink()) {
            const targetPath = follow ? await fsrealpath(path6) : path6;
            if (this.fsw.closed) return;
            const parent = sysPath.dirname(wh.watchPath);
            this.fsw._getWatchedDir(parent).add(wh.watchPath);
            this.fsw._emit(EV_ADD, wh.watchPath, stats);
            closer = await this._handleDir(parent, stats, initialAdd, depth, path6, wh, targetPath);
            if (this.fsw.closed) return;
            if (targetPath !== void 0) {
              this.fsw._symlinkPaths.set(sysPath.resolve(path6), targetPath);
            }
          } else {
            closer = this._handleFile(wh.watchPath, stats, initialAdd);
          }
          ready();
          this.fsw._addPathCloser(path6, closer);
          return false;
        } catch (error) {
          if (this.fsw._handleError(error)) {
            ready();
            return path6;
          }
        }
      }
    };
    module2.exports = NodeFsHandler;
  }
});

// node_modules/chokidar/lib/fsevents-handler.js
var require_fsevents_handler = __commonJS({
  "node_modules/chokidar/lib/fsevents-handler.js"(exports2, module2) {
    "use strict";
    var fs2 = require("fs");
    var sysPath = require("path");
    var { promisify } = require("util");
    var fsevents;
    try {
      fsevents = require("fsevents");
    } catch (error) {
      if (process.env.CHOKIDAR_PRINT_FSEVENTS_REQUIRE_ERROR) console.error(error);
    }
    if (fsevents) {
      const mtch = process.version.match(/v(\d+)\.(\d+)/);
      if (mtch && mtch[1] && mtch[2]) {
        const maj = Number.parseInt(mtch[1], 10);
        const min = Number.parseInt(mtch[2], 10);
        if (maj === 8 && min < 16) {
          fsevents = void 0;
        }
      }
    }
    var {
      EV_ADD,
      EV_CHANGE,
      EV_ADD_DIR,
      EV_UNLINK,
      EV_ERROR,
      STR_DATA,
      STR_END,
      FSEVENT_CREATED,
      FSEVENT_MODIFIED,
      FSEVENT_DELETED,
      FSEVENT_MOVED,
      // FSEVENT_CLONED,
      FSEVENT_UNKNOWN,
      FSEVENT_FLAG_MUST_SCAN_SUBDIRS,
      FSEVENT_TYPE_FILE,
      FSEVENT_TYPE_DIRECTORY,
      FSEVENT_TYPE_SYMLINK,
      ROOT_GLOBSTAR,
      DIR_SUFFIX,
      DOT_SLASH,
      FUNCTION_TYPE,
      EMPTY_FN,
      IDENTITY_FN
    } = require_constants3();
    var Depth = (value) => isNaN(value) ? {} : { depth: value };
    var stat = promisify(fs2.stat);
    var lstat = promisify(fs2.lstat);
    var realpath = promisify(fs2.realpath);
    var statMethods = { stat, lstat };
    var FSEventsWatchers = /* @__PURE__ */ new Map();
    var consolidateThreshhold = 10;
    var wrongEventFlags = /* @__PURE__ */ new Set([
      69888,
      70400,
      71424,
      72704,
      73472,
      131328,
      131840,
      262912
    ]);
    var createFSEventsInstance = (path6, callback) => {
      const stop = fsevents.watch(path6, callback);
      return { stop };
    };
    function setFSEventsListener(path6, realPath, listener, rawEmitter) {
      let watchPath = sysPath.extname(realPath) ? sysPath.dirname(realPath) : realPath;
      const parentPath = sysPath.dirname(watchPath);
      let cont = FSEventsWatchers.get(watchPath);
      if (couldConsolidate(parentPath)) {
        watchPath = parentPath;
      }
      const resolvedPath = sysPath.resolve(path6);
      const hasSymlink = resolvedPath !== realPath;
      const filteredListener = (fullPath, flags, info) => {
        if (hasSymlink) fullPath = fullPath.replace(realPath, resolvedPath);
        if (fullPath === resolvedPath || !fullPath.indexOf(resolvedPath + sysPath.sep)) listener(fullPath, flags, info);
      };
      let watchedParent = false;
      for (const watchedPath of FSEventsWatchers.keys()) {
        if (realPath.indexOf(sysPath.resolve(watchedPath) + sysPath.sep) === 0) {
          watchPath = watchedPath;
          cont = FSEventsWatchers.get(watchPath);
          watchedParent = true;
          break;
        }
      }
      if (cont || watchedParent) {
        cont.listeners.add(filteredListener);
      } else {
        cont = {
          listeners: /* @__PURE__ */ new Set([filteredListener]),
          rawEmitter,
          watcher: createFSEventsInstance(watchPath, (fullPath, flags) => {
            if (!cont.listeners.size) return;
            if (flags & FSEVENT_FLAG_MUST_SCAN_SUBDIRS) return;
            const info = fsevents.getInfo(fullPath, flags);
            cont.listeners.forEach((list) => {
              list(fullPath, flags, info);
            });
            cont.rawEmitter(info.event, fullPath, info);
          })
        };
        FSEventsWatchers.set(watchPath, cont);
      }
      return () => {
        const lst = cont.listeners;
        lst.delete(filteredListener);
        if (!lst.size) {
          FSEventsWatchers.delete(watchPath);
          if (cont.watcher) return cont.watcher.stop().then(() => {
            cont.rawEmitter = cont.watcher = void 0;
            Object.freeze(cont);
          });
        }
      };
    }
    var couldConsolidate = (path6) => {
      let count = 0;
      for (const watchPath of FSEventsWatchers.keys()) {
        if (watchPath.indexOf(path6) === 0) {
          count++;
          if (count >= consolidateThreshhold) {
            return true;
          }
        }
      }
      return false;
    };
    var canUse = () => fsevents && FSEventsWatchers.size < 128;
    var calcDepth = (path6, root) => {
      let i = 0;
      while (!path6.indexOf(root) && (path6 = sysPath.dirname(path6)) !== root) i++;
      return i;
    };
    var sameTypes = (info, stats) => info.type === FSEVENT_TYPE_DIRECTORY && stats.isDirectory() || info.type === FSEVENT_TYPE_SYMLINK && stats.isSymbolicLink() || info.type === FSEVENT_TYPE_FILE && stats.isFile();
    var FsEventsHandler = class {
      /**
       * @param {import('../index').FSWatcher} fsw
       */
      constructor(fsw) {
        this.fsw = fsw;
      }
      checkIgnored(path6, stats) {
        const ipaths = this.fsw._ignoredPaths;
        if (this.fsw._isIgnored(path6, stats)) {
          ipaths.add(path6);
          if (stats && stats.isDirectory()) {
            ipaths.add(path6 + ROOT_GLOBSTAR);
          }
          return true;
        }
        ipaths.delete(path6);
        ipaths.delete(path6 + ROOT_GLOBSTAR);
      }
      addOrChange(path6, fullPath, realPath, parent, watchedDir, item, info, opts) {
        const event = watchedDir.has(item) ? EV_CHANGE : EV_ADD;
        this.handleEvent(event, path6, fullPath, realPath, parent, watchedDir, item, info, opts);
      }
      async checkExists(path6, fullPath, realPath, parent, watchedDir, item, info, opts) {
        try {
          const stats = await stat(path6);
          if (this.fsw.closed) return;
          if (sameTypes(info, stats)) {
            this.addOrChange(path6, fullPath, realPath, parent, watchedDir, item, info, opts);
          } else {
            this.handleEvent(EV_UNLINK, path6, fullPath, realPath, parent, watchedDir, item, info, opts);
          }
        } catch (error) {
          if (error.code === "EACCES") {
            this.addOrChange(path6, fullPath, realPath, parent, watchedDir, item, info, opts);
          } else {
            this.handleEvent(EV_UNLINK, path6, fullPath, realPath, parent, watchedDir, item, info, opts);
          }
        }
      }
      handleEvent(event, path6, fullPath, realPath, parent, watchedDir, item, info, opts) {
        if (this.fsw.closed || this.checkIgnored(path6)) return;
        if (event === EV_UNLINK) {
          const isDirectory = info.type === FSEVENT_TYPE_DIRECTORY;
          if (isDirectory || watchedDir.has(item)) {
            this.fsw._remove(parent, item, isDirectory);
          }
        } else {
          if (event === EV_ADD) {
            if (info.type === FSEVENT_TYPE_DIRECTORY) this.fsw._getWatchedDir(path6);
            if (info.type === FSEVENT_TYPE_SYMLINK && opts.followSymlinks) {
              const curDepth = opts.depth === void 0 ? void 0 : calcDepth(fullPath, realPath) + 1;
              return this._addToFsEvents(path6, false, true, curDepth);
            }
            this.fsw._getWatchedDir(parent).add(item);
          }
          const eventName = info.type === FSEVENT_TYPE_DIRECTORY ? event + DIR_SUFFIX : event;
          this.fsw._emit(eventName, path6);
          if (eventName === EV_ADD_DIR) this._addToFsEvents(path6, false, true);
        }
      }
      /**
       * Handle symlinks encountered during directory scan
       * @param {String} watchPath  - file/dir path to be watched with fsevents
       * @param {String} realPath   - real path (in case of symlinks)
       * @param {Function} transform  - path transformer
       * @param {Function} globFilter - path filter in case a glob pattern was provided
       * @returns {Function} closer for the watcher instance
      */
      _watchWithFsEvents(watchPath, realPath, transform, globFilter) {
        if (this.fsw.closed || this.fsw._isIgnored(watchPath)) return;
        const opts = this.fsw.options;
        const watchCallback = async (fullPath, flags, info) => {
          if (this.fsw.closed) return;
          if (opts.depth !== void 0 && calcDepth(fullPath, realPath) > opts.depth) return;
          const path6 = transform(sysPath.join(
            watchPath,
            sysPath.relative(watchPath, fullPath)
          ));
          if (globFilter && !globFilter(path6)) return;
          const parent = sysPath.dirname(path6);
          const item = sysPath.basename(path6);
          const watchedDir = this.fsw._getWatchedDir(
            info.type === FSEVENT_TYPE_DIRECTORY ? path6 : parent
          );
          if (wrongEventFlags.has(flags) || info.event === FSEVENT_UNKNOWN) {
            if (typeof opts.ignored === FUNCTION_TYPE) {
              let stats;
              try {
                stats = await stat(path6);
              } catch (error) {
              }
              if (this.fsw.closed) return;
              if (this.checkIgnored(path6, stats)) return;
              if (sameTypes(info, stats)) {
                this.addOrChange(path6, fullPath, realPath, parent, watchedDir, item, info, opts);
              } else {
                this.handleEvent(EV_UNLINK, path6, fullPath, realPath, parent, watchedDir, item, info, opts);
              }
            } else {
              this.checkExists(path6, fullPath, realPath, parent, watchedDir, item, info, opts);
            }
          } else {
            switch (info.event) {
              case FSEVENT_CREATED:
              case FSEVENT_MODIFIED:
                return this.addOrChange(path6, fullPath, realPath, parent, watchedDir, item, info, opts);
              case FSEVENT_DELETED:
              case FSEVENT_MOVED:
                return this.checkExists(path6, fullPath, realPath, parent, watchedDir, item, info, opts);
            }
          }
        };
        const closer = setFSEventsListener(
          watchPath,
          realPath,
          watchCallback,
          this.fsw._emitRaw
        );
        this.fsw._emitReady();
        return closer;
      }
      /**
       * Handle symlinks encountered during directory scan
       * @param {String} linkPath path to symlink
       * @param {String} fullPath absolute path to the symlink
       * @param {Function} transform pre-existing path transformer
       * @param {Number} curDepth level of subdirectories traversed to where symlink is
       * @returns {Promise<void>}
       */
      async _handleFsEventsSymlink(linkPath, fullPath, transform, curDepth) {
        if (this.fsw.closed || this.fsw._symlinkPaths.has(fullPath)) return;
        this.fsw._symlinkPaths.set(fullPath, true);
        this.fsw._incrReadyCount();
        try {
          const linkTarget = await realpath(linkPath);
          if (this.fsw.closed) return;
          if (this.fsw._isIgnored(linkTarget)) {
            return this.fsw._emitReady();
          }
          this.fsw._incrReadyCount();
          this._addToFsEvents(linkTarget || linkPath, (path6) => {
            let aliasedPath = linkPath;
            if (linkTarget && linkTarget !== DOT_SLASH) {
              aliasedPath = path6.replace(linkTarget, linkPath);
            } else if (path6 !== DOT_SLASH) {
              aliasedPath = sysPath.join(linkPath, path6);
            }
            return transform(aliasedPath);
          }, false, curDepth);
        } catch (error) {
          if (this.fsw._handleError(error)) {
            return this.fsw._emitReady();
          }
        }
      }
      /**
       *
       * @param {Path} newPath
       * @param {fs.Stats} stats
       */
      emitAdd(newPath, stats, processPath, opts, forceAdd) {
        const pp = processPath(newPath);
        const isDir = stats.isDirectory();
        const dirObj = this.fsw._getWatchedDir(sysPath.dirname(pp));
        const base = sysPath.basename(pp);
        if (isDir) this.fsw._getWatchedDir(pp);
        if (dirObj.has(base)) return;
        dirObj.add(base);
        if (!opts.ignoreInitial || forceAdd === true) {
          this.fsw._emit(isDir ? EV_ADD_DIR : EV_ADD, pp, stats);
        }
      }
      initWatch(realPath, path6, wh, processPath) {
        if (this.fsw.closed) return;
        const closer = this._watchWithFsEvents(
          wh.watchPath,
          sysPath.resolve(realPath || wh.watchPath),
          processPath,
          wh.globFilter
        );
        this.fsw._addPathCloser(path6, closer);
      }
      /**
       * Handle added path with fsevents
       * @param {String} path file/dir path or glob pattern
       * @param {Function|Boolean=} transform converts working path to what the user expects
       * @param {Boolean=} forceAdd ensure add is emitted
       * @param {Number=} priorDepth Level of subdirectories already traversed.
       * @returns {Promise<void>}
       */
      async _addToFsEvents(path6, transform, forceAdd, priorDepth) {
        if (this.fsw.closed) {
          return;
        }
        const opts = this.fsw.options;
        const processPath = typeof transform === FUNCTION_TYPE ? transform : IDENTITY_FN;
        const wh = this.fsw._getWatchHelpers(path6);
        try {
          const stats = await statMethods[wh.statMethod](wh.watchPath);
          if (this.fsw.closed) return;
          if (this.fsw._isIgnored(wh.watchPath, stats)) {
            throw null;
          }
          if (stats.isDirectory()) {
            if (!wh.globFilter) this.emitAdd(processPath(path6), stats, processPath, opts, forceAdd);
            if (priorDepth && priorDepth > opts.depth) return;
            this.fsw._readdirp(wh.watchPath, {
              fileFilter: (entry) => wh.filterPath(entry),
              directoryFilter: (entry) => wh.filterDir(entry),
              ...Depth(opts.depth - (priorDepth || 0))
            }).on(STR_DATA, (entry) => {
              if (this.fsw.closed) {
                return;
              }
              if (entry.stats.isDirectory() && !wh.filterPath(entry)) return;
              const joinedPath = sysPath.join(wh.watchPath, entry.path);
              const { fullPath } = entry;
              if (wh.followSymlinks && entry.stats.isSymbolicLink()) {
                const curDepth = opts.depth === void 0 ? void 0 : calcDepth(joinedPath, sysPath.resolve(wh.watchPath)) + 1;
                this._handleFsEventsSymlink(joinedPath, fullPath, processPath, curDepth);
              } else {
                this.emitAdd(joinedPath, entry.stats, processPath, opts, forceAdd);
              }
            }).on(EV_ERROR, EMPTY_FN).on(STR_END, () => {
              this.fsw._emitReady();
            });
          } else {
            this.emitAdd(wh.watchPath, stats, processPath, opts, forceAdd);
            this.fsw._emitReady();
          }
        } catch (error) {
          if (!error || this.fsw._handleError(error)) {
            this.fsw._emitReady();
            this.fsw._emitReady();
          }
        }
        if (opts.persistent && forceAdd !== true) {
          if (typeof transform === FUNCTION_TYPE) {
            this.initWatch(void 0, path6, wh, processPath);
          } else {
            let realPath;
            try {
              realPath = await realpath(wh.watchPath);
            } catch (e) {
            }
            this.initWatch(realPath, path6, wh, processPath);
          }
        }
      }
    };
    module2.exports = FsEventsHandler;
    module2.exports.canUse = canUse;
  }
});

// node_modules/chokidar/index.js
var require_chokidar = __commonJS({
  "node_modules/chokidar/index.js"(exports2) {
    "use strict";
    var { EventEmitter: EventEmitter2 } = require("events");
    var fs2 = require("fs");
    var sysPath = require("path");
    var { promisify } = require("util");
    var readdirp = require_readdirp();
    var anymatch = require_anymatch().default;
    var globParent = require_glob_parent();
    var isGlob = require_is_glob();
    var braces = require_braces();
    var normalizePath = require_normalize_path();
    var NodeFsHandler = require_nodefs_handler();
    var FsEventsHandler = require_fsevents_handler();
    var {
      EV_ALL,
      EV_READY,
      EV_ADD,
      EV_CHANGE,
      EV_UNLINK,
      EV_ADD_DIR,
      EV_UNLINK_DIR,
      EV_RAW,
      EV_ERROR,
      STR_CLOSE,
      STR_END,
      BACK_SLASH_RE,
      DOUBLE_SLASH_RE,
      SLASH_OR_BACK_SLASH_RE,
      DOT_RE,
      REPLACER_RE,
      SLASH,
      SLASH_SLASH,
      BRACE_START,
      BANG,
      ONE_DOT,
      TWO_DOTS,
      GLOBSTAR,
      SLASH_GLOBSTAR,
      ANYMATCH_OPTS,
      STRING_TYPE,
      FUNCTION_TYPE,
      EMPTY_STR,
      EMPTY_FN,
      isWindows,
      isMacos,
      isIBMi
    } = require_constants3();
    var stat = promisify(fs2.stat);
    var readdir = promisify(fs2.readdir);
    var arrify = (value = []) => Array.isArray(value) ? value : [value];
    var flatten = (list, result = []) => {
      list.forEach((item) => {
        if (Array.isArray(item)) {
          flatten(item, result);
        } else {
          result.push(item);
        }
      });
      return result;
    };
    var unifyPaths = (paths_) => {
      const paths = flatten(arrify(paths_));
      if (!paths.every((p) => typeof p === STRING_TYPE)) {
        throw new TypeError(`Non-string provided as watch path: ${paths}`);
      }
      return paths.map(normalizePathToUnix);
    };
    var toUnix = (string) => {
      let str = string.replace(BACK_SLASH_RE, SLASH);
      let prepend = false;
      if (str.startsWith(SLASH_SLASH)) {
        prepend = true;
      }
      while (str.match(DOUBLE_SLASH_RE)) {
        str = str.replace(DOUBLE_SLASH_RE, SLASH);
      }
      if (prepend) {
        str = SLASH + str;
      }
      return str;
    };
    var normalizePathToUnix = (path6) => toUnix(sysPath.normalize(toUnix(path6)));
    var normalizeIgnored = (cwd = EMPTY_STR) => (path6) => {
      if (typeof path6 !== STRING_TYPE) return path6;
      return normalizePathToUnix(sysPath.isAbsolute(path6) ? path6 : sysPath.join(cwd, path6));
    };
    var getAbsolutePath = (path6, cwd) => {
      if (sysPath.isAbsolute(path6)) {
        return path6;
      }
      if (path6.startsWith(BANG)) {
        return BANG + sysPath.join(cwd, path6.slice(1));
      }
      return sysPath.join(cwd, path6);
    };
    var undef = (opts, key) => opts[key] === void 0;
    var DirEntry = class {
      /**
       * @param {Path} dir
       * @param {Function} removeWatcher
       */
      constructor(dir, removeWatcher) {
        this.path = dir;
        this._removeWatcher = removeWatcher;
        this.items = /* @__PURE__ */ new Set();
      }
      add(item) {
        const { items } = this;
        if (!items) return;
        if (item !== ONE_DOT && item !== TWO_DOTS) items.add(item);
      }
      async remove(item) {
        const { items } = this;
        if (!items) return;
        items.delete(item);
        if (items.size > 0) return;
        const dir = this.path;
        try {
          await readdir(dir);
        } catch (err) {
          if (this._removeWatcher) {
            this._removeWatcher(sysPath.dirname(dir), sysPath.basename(dir));
          }
        }
      }
      has(item) {
        const { items } = this;
        if (!items) return;
        return items.has(item);
      }
      /**
       * @returns {Array<String>}
       */
      getChildren() {
        const { items } = this;
        if (!items) return;
        return [...items.values()];
      }
      dispose() {
        this.items.clear();
        delete this.path;
        delete this._removeWatcher;
        delete this.items;
        Object.freeze(this);
      }
    };
    var STAT_METHOD_F = "stat";
    var STAT_METHOD_L = "lstat";
    var WatchHelper = class {
      constructor(path6, watchPath, follow, fsw) {
        this.fsw = fsw;
        this.path = path6 = path6.replace(REPLACER_RE, EMPTY_STR);
        this.watchPath = watchPath;
        this.fullWatchPath = sysPath.resolve(watchPath);
        this.hasGlob = watchPath !== path6;
        if (path6 === EMPTY_STR) this.hasGlob = false;
        this.globSymlink = this.hasGlob && follow ? void 0 : false;
        this.globFilter = this.hasGlob ? anymatch(path6, void 0, ANYMATCH_OPTS) : false;
        this.dirParts = this.getDirParts(path6);
        this.dirParts.forEach((parts) => {
          if (parts.length > 1) parts.pop();
        });
        this.followSymlinks = follow;
        this.statMethod = follow ? STAT_METHOD_F : STAT_METHOD_L;
      }
      checkGlobSymlink(entry) {
        if (this.globSymlink === void 0) {
          this.globSymlink = entry.fullParentDir === this.fullWatchPath ? false : { realPath: entry.fullParentDir, linkPath: this.fullWatchPath };
        }
        if (this.globSymlink) {
          return entry.fullPath.replace(this.globSymlink.realPath, this.globSymlink.linkPath);
        }
        return entry.fullPath;
      }
      entryPath(entry) {
        return sysPath.join(
          this.watchPath,
          sysPath.relative(this.watchPath, this.checkGlobSymlink(entry))
        );
      }
      filterPath(entry) {
        const { stats } = entry;
        if (stats && stats.isSymbolicLink()) return this.filterDir(entry);
        const resolvedPath = this.entryPath(entry);
        const matchesGlob = this.hasGlob && typeof this.globFilter === FUNCTION_TYPE ? this.globFilter(resolvedPath) : true;
        return matchesGlob && this.fsw._isntIgnored(resolvedPath, stats) && this.fsw._hasReadPermissions(stats);
      }
      getDirParts(path6) {
        if (!this.hasGlob) return [];
        const parts = [];
        const expandedPath = path6.includes(BRACE_START) ? braces.expand(path6) : [path6];
        expandedPath.forEach((path7) => {
          parts.push(sysPath.relative(this.watchPath, path7).split(SLASH_OR_BACK_SLASH_RE));
        });
        return parts;
      }
      filterDir(entry) {
        if (this.hasGlob) {
          const entryParts = this.getDirParts(this.checkGlobSymlink(entry));
          let globstar = false;
          this.unmatchedGlob = !this.dirParts.some((parts) => {
            return parts.every((part, i) => {
              if (part === GLOBSTAR) globstar = true;
              return globstar || !entryParts[0][i] || anymatch(part, entryParts[0][i], ANYMATCH_OPTS);
            });
          });
        }
        return !this.unmatchedGlob && this.fsw._isntIgnored(this.entryPath(entry), entry.stats);
      }
    };
    var FSWatcher = class extends EventEmitter2 {
      // Not indenting methods for history sake; for now.
      constructor(_opts) {
        super();
        const opts = {};
        if (_opts) Object.assign(opts, _opts);
        this._watched = /* @__PURE__ */ new Map();
        this._closers = /* @__PURE__ */ new Map();
        this._ignoredPaths = /* @__PURE__ */ new Set();
        this._throttled = /* @__PURE__ */ new Map();
        this._symlinkPaths = /* @__PURE__ */ new Map();
        this._streams = /* @__PURE__ */ new Set();
        this.closed = false;
        if (undef(opts, "persistent")) opts.persistent = true;
        if (undef(opts, "ignoreInitial")) opts.ignoreInitial = false;
        if (undef(opts, "ignorePermissionErrors")) opts.ignorePermissionErrors = false;
        if (undef(opts, "interval")) opts.interval = 100;
        if (undef(opts, "binaryInterval")) opts.binaryInterval = 300;
        if (undef(opts, "disableGlobbing")) opts.disableGlobbing = false;
        opts.enableBinaryInterval = opts.binaryInterval !== opts.interval;
        if (undef(opts, "useFsEvents")) opts.useFsEvents = !opts.usePolling;
        const canUseFsEvents = FsEventsHandler.canUse();
        if (!canUseFsEvents) opts.useFsEvents = false;
        if (undef(opts, "usePolling") && !opts.useFsEvents) {
          opts.usePolling = isMacos;
        }
        if (isIBMi) {
          opts.usePolling = true;
        }
        const envPoll = process.env.CHOKIDAR_USEPOLLING;
        if (envPoll !== void 0) {
          const envLower = envPoll.toLowerCase();
          if (envLower === "false" || envLower === "0") {
            opts.usePolling = false;
          } else if (envLower === "true" || envLower === "1") {
            opts.usePolling = true;
          } else {
            opts.usePolling = !!envLower;
          }
        }
        const envInterval = process.env.CHOKIDAR_INTERVAL;
        if (envInterval) {
          opts.interval = Number.parseInt(envInterval, 10);
        }
        if (undef(opts, "atomic")) opts.atomic = !opts.usePolling && !opts.useFsEvents;
        if (opts.atomic) this._pendingUnlinks = /* @__PURE__ */ new Map();
        if (undef(opts, "followSymlinks")) opts.followSymlinks = true;
        if (undef(opts, "awaitWriteFinish")) opts.awaitWriteFinish = false;
        if (opts.awaitWriteFinish === true) opts.awaitWriteFinish = {};
        const awf = opts.awaitWriteFinish;
        if (awf) {
          if (!awf.stabilityThreshold) awf.stabilityThreshold = 2e3;
          if (!awf.pollInterval) awf.pollInterval = 100;
          this._pendingWrites = /* @__PURE__ */ new Map();
        }
        if (opts.ignored) opts.ignored = arrify(opts.ignored);
        let readyCalls = 0;
        this._emitReady = () => {
          readyCalls++;
          if (readyCalls >= this._readyCount) {
            this._emitReady = EMPTY_FN;
            this._readyEmitted = true;
            process.nextTick(() => this.emit(EV_READY));
          }
        };
        this._emitRaw = (...args) => this.emit(EV_RAW, ...args);
        this._readyEmitted = false;
        this.options = opts;
        if (opts.useFsEvents) {
          this._fsEventsHandler = new FsEventsHandler(this);
        } else {
          this._nodeFsHandler = new NodeFsHandler(this);
        }
        Object.freeze(opts);
      }
      // Public methods
      /**
       * Adds paths to be watched on an existing FSWatcher instance
       * @param {Path|Array<Path>} paths_
       * @param {String=} _origAdd private; for handling non-existent paths to be watched
       * @param {Boolean=} _internal private; indicates a non-user add
       * @returns {FSWatcher} for chaining
       */
      add(paths_, _origAdd, _internal) {
        const { cwd, disableGlobbing } = this.options;
        this.closed = false;
        let paths = unifyPaths(paths_);
        if (cwd) {
          paths = paths.map((path6) => {
            const absPath = getAbsolutePath(path6, cwd);
            if (disableGlobbing || !isGlob(path6)) {
              return absPath;
            }
            return normalizePath(absPath);
          });
        }
        paths = paths.filter((path6) => {
          if (path6.startsWith(BANG)) {
            this._ignoredPaths.add(path6.slice(1));
            return false;
          }
          this._ignoredPaths.delete(path6);
          this._ignoredPaths.delete(path6 + SLASH_GLOBSTAR);
          this._userIgnored = void 0;
          return true;
        });
        if (this.options.useFsEvents && this._fsEventsHandler) {
          if (!this._readyCount) this._readyCount = paths.length;
          if (this.options.persistent) this._readyCount += paths.length;
          paths.forEach((path6) => this._fsEventsHandler._addToFsEvents(path6));
        } else {
          if (!this._readyCount) this._readyCount = 0;
          this._readyCount += paths.length;
          Promise.all(
            paths.map(async (path6) => {
              const res = await this._nodeFsHandler._addToNodeFs(path6, !_internal, 0, 0, _origAdd);
              if (res) this._emitReady();
              return res;
            })
          ).then((results) => {
            if (this.closed) return;
            results.filter((item) => item).forEach((item) => {
              this.add(sysPath.dirname(item), sysPath.basename(_origAdd || item));
            });
          });
        }
        return this;
      }
      /**
       * Close watchers or start ignoring events from specified paths.
       * @param {Path|Array<Path>} paths_ - string or array of strings, file/directory paths and/or globs
       * @returns {FSWatcher} for chaining
      */
      unwatch(paths_) {
        if (this.closed) return this;
        const paths = unifyPaths(paths_);
        const { cwd } = this.options;
        paths.forEach((path6) => {
          if (!sysPath.isAbsolute(path6) && !this._closers.has(path6)) {
            if (cwd) path6 = sysPath.join(cwd, path6);
            path6 = sysPath.resolve(path6);
          }
          this._closePath(path6);
          this._ignoredPaths.add(path6);
          if (this._watched.has(path6)) {
            this._ignoredPaths.add(path6 + SLASH_GLOBSTAR);
          }
          this._userIgnored = void 0;
        });
        return this;
      }
      /**
       * Close watchers and remove all listeners from watched paths.
       * @returns {Promise<void>}.
      */
      close() {
        if (this.closed) return this._closePromise;
        this.closed = true;
        this.removeAllListeners();
        const closers = [];
        this._closers.forEach((closerList) => closerList.forEach((closer) => {
          const promise = closer();
          if (promise instanceof Promise) closers.push(promise);
        }));
        this._streams.forEach((stream) => stream.destroy());
        this._userIgnored = void 0;
        this._readyCount = 0;
        this._readyEmitted = false;
        this._watched.forEach((dirent) => dirent.dispose());
        ["closers", "watched", "streams", "symlinkPaths", "throttled"].forEach((key) => {
          this[`_${key}`].clear();
        });
        this._closePromise = closers.length ? Promise.all(closers).then(() => void 0) : Promise.resolve();
        return this._closePromise;
      }
      /**
       * Expose list of watched paths
       * @returns {Object} for chaining
      */
      getWatched() {
        const watchList = {};
        this._watched.forEach((entry, dir) => {
          const key = this.options.cwd ? sysPath.relative(this.options.cwd, dir) : dir;
          watchList[key || ONE_DOT] = entry.getChildren().sort();
        });
        return watchList;
      }
      emitWithAll(event, args) {
        this.emit(...args);
        if (event !== EV_ERROR) this.emit(EV_ALL, ...args);
      }
      // Common helpers
      // --------------
      /**
       * Normalize and emit events.
       * Calling _emit DOES NOT MEAN emit() would be called!
       * @param {EventName} event Type of event
       * @param {Path} path File or directory path
       * @param {*=} val1 arguments to be passed with event
       * @param {*=} val2
       * @param {*=} val3
       * @returns the error if defined, otherwise the value of the FSWatcher instance's `closed` flag
       */
      async _emit(event, path6, val1, val2, val3) {
        if (this.closed) return;
        const opts = this.options;
        if (isWindows) path6 = sysPath.normalize(path6);
        if (opts.cwd) path6 = sysPath.relative(opts.cwd, path6);
        const args = [event, path6];
        if (val3 !== void 0) args.push(val1, val2, val3);
        else if (val2 !== void 0) args.push(val1, val2);
        else if (val1 !== void 0) args.push(val1);
        const awf = opts.awaitWriteFinish;
        let pw;
        if (awf && (pw = this._pendingWrites.get(path6))) {
          pw.lastChange = /* @__PURE__ */ new Date();
          return this;
        }
        if (opts.atomic) {
          if (event === EV_UNLINK) {
            this._pendingUnlinks.set(path6, args);
            setTimeout(() => {
              this._pendingUnlinks.forEach((entry, path7) => {
                this.emit(...entry);
                this.emit(EV_ALL, ...entry);
                this._pendingUnlinks.delete(path7);
              });
            }, typeof opts.atomic === "number" ? opts.atomic : 100);
            return this;
          }
          if (event === EV_ADD && this._pendingUnlinks.has(path6)) {
            event = args[0] = EV_CHANGE;
            this._pendingUnlinks.delete(path6);
          }
        }
        if (awf && (event === EV_ADD || event === EV_CHANGE) && this._readyEmitted) {
          const awfEmit = (err, stats) => {
            if (err) {
              event = args[0] = EV_ERROR;
              args[1] = err;
              this.emitWithAll(event, args);
            } else if (stats) {
              if (args.length > 2) {
                args[2] = stats;
              } else {
                args.push(stats);
              }
              this.emitWithAll(event, args);
            }
          };
          this._awaitWriteFinish(path6, awf.stabilityThreshold, event, awfEmit);
          return this;
        }
        if (event === EV_CHANGE) {
          const isThrottled = !this._throttle(EV_CHANGE, path6, 50);
          if (isThrottled) return this;
        }
        if (opts.alwaysStat && val1 === void 0 && (event === EV_ADD || event === EV_ADD_DIR || event === EV_CHANGE)) {
          const fullPath = opts.cwd ? sysPath.join(opts.cwd, path6) : path6;
          let stats;
          try {
            stats = await stat(fullPath);
          } catch (err) {
          }
          if (!stats || this.closed) return;
          args.push(stats);
        }
        this.emitWithAll(event, args);
        return this;
      }
      /**
       * Common handler for errors
       * @param {Error} error
       * @returns {Error|Boolean} The error if defined, otherwise the value of the FSWatcher instance's `closed` flag
       */
      _handleError(error) {
        const code = error && error.code;
        if (error && code !== "ENOENT" && code !== "ENOTDIR" && (!this.options.ignorePermissionErrors || code !== "EPERM" && code !== "EACCES")) {
          this.emit(EV_ERROR, error);
        }
        return error || this.closed;
      }
      /**
       * Helper utility for throttling
       * @param {ThrottleType} actionType type being throttled
       * @param {Path} path being acted upon
       * @param {Number} timeout duration of time to suppress duplicate actions
       * @returns {Object|false} tracking object or false if action should be suppressed
       */
      _throttle(actionType, path6, timeout) {
        if (!this._throttled.has(actionType)) {
          this._throttled.set(actionType, /* @__PURE__ */ new Map());
        }
        const action = this._throttled.get(actionType);
        const actionPath = action.get(path6);
        if (actionPath) {
          actionPath.count++;
          return false;
        }
        let timeoutObject;
        const clear = () => {
          const item = action.get(path6);
          const count = item ? item.count : 0;
          action.delete(path6);
          clearTimeout(timeoutObject);
          if (item) clearTimeout(item.timeoutObject);
          return count;
        };
        timeoutObject = setTimeout(clear, timeout);
        const thr = { timeoutObject, clear, count: 0 };
        action.set(path6, thr);
        return thr;
      }
      _incrReadyCount() {
        return this._readyCount++;
      }
      /**
       * Awaits write operation to finish.
       * Polls a newly created file for size variations. When files size does not change for 'threshold' milliseconds calls callback.
       * @param {Path} path being acted upon
       * @param {Number} threshold Time in milliseconds a file size must be fixed before acknowledging write OP is finished
       * @param {EventName} event
       * @param {Function} awfEmit Callback to be called when ready for event to be emitted.
       */
      _awaitWriteFinish(path6, threshold, event, awfEmit) {
        let timeoutHandler;
        let fullPath = path6;
        if (this.options.cwd && !sysPath.isAbsolute(path6)) {
          fullPath = sysPath.join(this.options.cwd, path6);
        }
        const now = /* @__PURE__ */ new Date();
        const awaitWriteFinish = (prevStat) => {
          fs2.stat(fullPath, (err, curStat) => {
            if (err || !this._pendingWrites.has(path6)) {
              if (err && err.code !== "ENOENT") awfEmit(err);
              return;
            }
            const now2 = Number(/* @__PURE__ */ new Date());
            if (prevStat && curStat.size !== prevStat.size) {
              this._pendingWrites.get(path6).lastChange = now2;
            }
            const pw = this._pendingWrites.get(path6);
            const df = now2 - pw.lastChange;
            if (df >= threshold) {
              this._pendingWrites.delete(path6);
              awfEmit(void 0, curStat);
            } else {
              timeoutHandler = setTimeout(
                awaitWriteFinish,
                this.options.awaitWriteFinish.pollInterval,
                curStat
              );
            }
          });
        };
        if (!this._pendingWrites.has(path6)) {
          this._pendingWrites.set(path6, {
            lastChange: now,
            cancelWait: () => {
              this._pendingWrites.delete(path6);
              clearTimeout(timeoutHandler);
              return event;
            }
          });
          timeoutHandler = setTimeout(
            awaitWriteFinish,
            this.options.awaitWriteFinish.pollInterval
          );
        }
      }
      _getGlobIgnored() {
        return [...this._ignoredPaths.values()];
      }
      /**
       * Determines whether user has asked to ignore this path.
       * @param {Path} path filepath or dir
       * @param {fs.Stats=} stats result of fs.stat
       * @returns {Boolean}
       */
      _isIgnored(path6, stats) {
        if (this.options.atomic && DOT_RE.test(path6)) return true;
        if (!this._userIgnored) {
          const { cwd } = this.options;
          const ign = this.options.ignored;
          const ignored = ign && ign.map(normalizeIgnored(cwd));
          const paths = arrify(ignored).filter((path7) => typeof path7 === STRING_TYPE && !isGlob(path7)).map((path7) => path7 + SLASH_GLOBSTAR);
          const list = this._getGlobIgnored().map(normalizeIgnored(cwd)).concat(ignored, paths);
          this._userIgnored = anymatch(list, void 0, ANYMATCH_OPTS);
        }
        return this._userIgnored([path6, stats]);
      }
      _isntIgnored(path6, stat2) {
        return !this._isIgnored(path6, stat2);
      }
      /**
       * Provides a set of common helpers and properties relating to symlink and glob handling.
       * @param {Path} path file, directory, or glob pattern being watched
       * @param {Number=} depth at any depth > 0, this isn't a glob
       * @returns {WatchHelper} object containing helpers for this path
       */
      _getWatchHelpers(path6, depth) {
        const watchPath = depth || this.options.disableGlobbing || !isGlob(path6) ? path6 : globParent(path6);
        const follow = this.options.followSymlinks;
        return new WatchHelper(path6, watchPath, follow, this);
      }
      // Directory helpers
      // -----------------
      /**
       * Provides directory tracking objects
       * @param {String} directory path of the directory
       * @returns {DirEntry} the directory's tracking object
       */
      _getWatchedDir(directory) {
        if (!this._boundRemove) this._boundRemove = this._remove.bind(this);
        const dir = sysPath.resolve(directory);
        if (!this._watched.has(dir)) this._watched.set(dir, new DirEntry(dir, this._boundRemove));
        return this._watched.get(dir);
      }
      // File helpers
      // ------------
      /**
       * Check for read permissions.
       * Based on this answer on SO: https://stackoverflow.com/a/11781404/1358405
       * @param {fs.Stats} stats - object, result of fs_stat
       * @returns {Boolean} indicates whether the file can be read
      */
      _hasReadPermissions(stats) {
        if (this.options.ignorePermissionErrors) return true;
        const md = stats && Number.parseInt(stats.mode, 10);
        const st = md & 511;
        const it = Number.parseInt(st.toString(8)[0], 10);
        return Boolean(4 & it);
      }
      /**
       * Handles emitting unlink events for
       * files and directories, and via recursion, for
       * files and directories within directories that are unlinked
       * @param {String} directory within which the following item is located
       * @param {String} item      base path of item/directory
       * @returns {void}
      */
      _remove(directory, item, isDirectory) {
        const path6 = sysPath.join(directory, item);
        const fullPath = sysPath.resolve(path6);
        isDirectory = isDirectory != null ? isDirectory : this._watched.has(path6) || this._watched.has(fullPath);
        if (!this._throttle("remove", path6, 100)) return;
        if (!isDirectory && !this.options.useFsEvents && this._watched.size === 1) {
          this.add(directory, item, true);
        }
        const wp = this._getWatchedDir(path6);
        const nestedDirectoryChildren = wp.getChildren();
        nestedDirectoryChildren.forEach((nested) => this._remove(path6, nested));
        const parent = this._getWatchedDir(directory);
        const wasTracked = parent.has(item);
        parent.remove(item);
        if (this._symlinkPaths.has(fullPath)) {
          this._symlinkPaths.delete(fullPath);
        }
        let relPath = path6;
        if (this.options.cwd) relPath = sysPath.relative(this.options.cwd, path6);
        if (this.options.awaitWriteFinish && this._pendingWrites.has(relPath)) {
          const event = this._pendingWrites.get(relPath).cancelWait();
          if (event === EV_ADD) return;
        }
        this._watched.delete(path6);
        this._watched.delete(fullPath);
        const eventName = isDirectory ? EV_UNLINK_DIR : EV_UNLINK;
        if (wasTracked && !this._isIgnored(path6)) this._emit(eventName, path6);
        if (!this.options.useFsEvents) {
          this._closePath(path6);
        }
      }
      /**
       * Closes all watchers for a path
       * @param {Path} path
       */
      _closePath(path6) {
        this._closeFile(path6);
        const dir = sysPath.dirname(path6);
        this._getWatchedDir(dir).remove(sysPath.basename(path6));
      }
      /**
       * Closes only file-specific watchers
       * @param {Path} path
       */
      _closeFile(path6) {
        const closers = this._closers.get(path6);
        if (!closers) return;
        closers.forEach((closer) => closer());
        this._closers.delete(path6);
      }
      /**
       *
       * @param {Path} path
       * @param {Function} closer
       */
      _addPathCloser(path6, closer) {
        if (!closer) return;
        let list = this._closers.get(path6);
        if (!list) {
          list = [];
          this._closers.set(path6, list);
        }
        list.push(closer);
      }
      _readdirp(root, opts) {
        if (this.closed) return;
        const options = { type: EV_ALL, alwaysStat: true, lstat: true, ...opts };
        let stream = readdirp(root, options);
        this._streams.add(stream);
        stream.once(STR_CLOSE, () => {
          stream = void 0;
        });
        stream.once(STR_END, () => {
          if (stream) {
            this._streams.delete(stream);
            stream = void 0;
          }
        });
        return stream;
      }
    };
    exports2.FSWatcher = FSWatcher;
    var watch3 = (paths, options) => {
      const watcher = new FSWatcher(options);
      watcher.add(paths);
      return watcher;
    };
    exports2.watch = watch3;
  }
});

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var vscode11 = __toESM(require("vscode"));

// src/providers/DashboardViewProvider.ts
var vscode = __toESM(require("vscode"));
var crypto = __toESM(require("crypto"));
var path = __toESM(require("path"));
function notify(message, ...items) {
  const config = vscode.workspace.getConfiguration("projectMemory");
  if (config.get("showNotifications", true)) {
    return vscode.window.showInformationMessage(message, ...items);
  }
  return Promise.resolve(void 0);
}
var DashboardViewProvider = class {
  constructor(_extensionUri, dataRoot, agentsRoot) {
    this._extensionUri = _extensionUri;
    this._dataRoot = dataRoot;
    this._agentsRoot = agentsRoot;
  }
  static viewType = "projectMemory.dashboardView";
  _view;
  _dataRoot;
  _agentsRoot;
  _disposables = [];
  dispose() {
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
  // Compute workspace ID to match MCP server format exactly
  getWorkspaceId() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return null;
    const workspacePath = workspaceFolder.uri.fsPath;
    const normalizedPath = path.normalize(workspacePath).toLowerCase();
    const hash = crypto.createHash("sha256").update(normalizedPath).digest("hex").substring(0, 12);
    const folderName = path.basename(workspacePath).replace(/[^a-zA-Z0-9-_]/g, "-");
    return `${folderName}-${hash}`;
  }
  resolveWebviewView(webviewView, context, _token) {
    this.dispose();
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this._extensionUri, "webview", "dist"),
        vscode.Uri.joinPath(this._extensionUri, "resources")
      ]
    };
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
    this._disposables.push(
      webviewView.onDidDispose(() => {
        this._view = void 0;
      })
    );
    this._disposables.push(
      webviewView.webview.onDidReceiveMessage(async (message) => {
        console.log("Received message from webview:", message);
        switch (message.type) {
          case "openFile":
            const { filePath, line } = message.data;
            vscode.commands.executeCommand("projectMemory.openFile", filePath, line);
            break;
          case "runCommand":
            const { command } = message.data;
            console.log("Executing command:", command);
            try {
              await vscode.commands.executeCommand(command);
              console.log("Command executed successfully");
            } catch (err) {
              console.error("Command execution failed:", err);
              vscode.window.showErrorMessage(`Command failed: ${err}`);
            }
            break;
          case "openExternal":
            const { url } = message.data;
            console.log("Opening dashboard panel:", url);
            vscode.commands.executeCommand("projectMemory.openDashboardPanel", url);
            break;
          case "openPlan":
            const { planId, workspaceId } = message.data;
            const planUrl = `http://localhost:5173/workspace/${workspaceId}/plan/${planId}`;
            console.log("Opening plan:", planUrl);
            vscode.commands.executeCommand("projectMemory.openDashboardPanel", planUrl);
            break;
          case "copyToClipboard":
            const { text } = message.data;
            await vscode.env.clipboard.writeText(text);
            notify(`Copied to clipboard: ${text}`);
            break;
          case "showNotification":
            const { level, text: notifText } = message.data;
            if (level === "error") {
              vscode.window.showErrorMessage(notifText);
            } else if (level === "warning") {
              vscode.window.showWarningMessage(notifText);
            } else {
              notify(notifText);
            }
            break;
          case "revealInExplorer":
            const { path: path6 } = message.data;
            vscode.commands.executeCommand("revealInExplorer", vscode.Uri.file(path6));
            break;
          case "getConfig":
            this.postMessage({
              type: "config",
              data: {
                dataRoot: this._dataRoot,
                agentsRoot: this._agentsRoot,
                workspaceFolders: vscode.workspace.workspaceFolders?.map((f) => ({
                  name: f.name,
                  path: f.uri.fsPath
                })) || []
              }
            });
            break;
          case "ready":
            this.postMessage({
              type: "init",
              data: {
                dataRoot: this._dataRoot,
                agentsRoot: this._agentsRoot
              }
            });
            break;
        }
      })
    );
  }
  postMessage(message) {
    if (this._view) {
      this._view.webview.postMessage(message);
    }
  }
  updateConfig(dataRoot, agentsRoot) {
    this._dataRoot = dataRoot;
    this._agentsRoot = agentsRoot;
    this.postMessage({
      type: "configUpdated",
      data: { dataRoot, agentsRoot }
    });
  }
  _getHtmlForWebview(webview) {
    const nonce = getNonce();
    const config = vscode.workspace.getConfiguration("projectMemory");
    const apiPort = config.get("serverPort") || config.get("apiPort") || 3001;
    const dashboardUrl = `http://localhost:5173`;
    const workspaceId = this.getWorkspaceId() || "";
    const workspaceName = vscode.workspace.workspaceFolders?.[0]?.name || "No workspace";
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src http://localhost:* ws://localhost:*; frame-src http://localhost:*;">
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
    
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const apiPort = ${apiPort};
        const dashboardUrl = '${dashboardUrl}';
        const workspaceId = '${workspaceId}';
        const workspaceName = '${workspaceName}';
        
        let activePlans = [];
        let archivedPlans = [];
        
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
            
            // Handle collapsible headers
            if (target.closest('.collapsible-header')) {
                const collapsible = target.closest('.collapsible');
                collapsible.classList.toggle('collapsed');
                return;
            }
            
            if (!target.matches('button')) return;
            
            const action = target.getAttribute('data-action');
            const command = target.getAttribute('data-command');
            const planId = target.getAttribute('data-plan-id');
            const copyText = target.getAttribute('data-copy');
            
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
                const shortId = plan.id.split('_').pop() || plan.id.substring(0, 8);
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
                            <button class="btn btn-small btn-secondary" data-action="copy" data-copy="\${plan.id}" title="Copy plan ID">\u{1F4CB}</button>
                            <button class="btn btn-small" data-action="open-plan" data-plan-id="\${plan.id}" title="Open plan">\u2192</button>
                        </div>
                    </div>
                \`;
            }).join('');
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
            const activeList = document.getElementById('activePlansList');
            const archivedList = document.getElementById('archivedPlansList');
            const activeCount = document.getElementById('activeCount');
            const archivedCount = document.getElementById('archivedCount');
            
            if (activeList) activeList.innerHTML = renderPlanList(activePlans, 'active');
            if (archivedList) archivedList.innerHTML = renderPlanList(archivedPlans, 'archived');
            if (activeCount) activeCount.textContent = activePlans.length;
            if (archivedCount) archivedCount.textContent = archivedPlans.length;
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
                                <li><span class="label">API Port:</span> <span>\${apiPort}</span></li>
                                <li><span class="label">Workspace:</span> <span>\${workspaceName}</span></li>
                            </ul>
                        </div>
                        <div style="padding: 8px 16px; display: flex; gap: 8px;">
                            <button class="btn" style="flex:1" data-action="open-browser">Open Full Dashboard</button>
                            <button class="btn btn-secondary" data-action="refresh">\u21BB</button>
                        </div>
                        <div class="info-card">
                            <h3>\u26A1 Quick Actions</h3>
                            <ul>
                                <li><button class="btn btn-secondary" style="width:100%" data-action="run-command" data-command="projectMemory.createPlan">Create New Plan</button></li>
                                <li><button class="btn btn-secondary" style="width:100%" data-action="run-command" data-command="projectMemory.deployAgents">Deploy Agents</button></li>
                                <li><button class="btn btn-secondary" style="width:100%" data-action="run-command" data-command="projectMemory.deployInstructions">Deploy Instructions</button></li>
                                <li><button class="btn btn-secondary" style="width:100%" data-action="run-command" data-command="projectMemory.deployPrompts">Deploy Prompts</button></li>
                            </ul>
                        </div>
                        
                        <div class="info-card">
                            <h3>\u2699\uFE0F Configuration</h3>
                            <ul>
                                <li><button class="btn btn-secondary" style="width:100%" data-action="run-command" data-command="projectMemory.openSettings">Configure Defaults</button></li>
                                <li><button class="btn btn-secondary" style="width:100%" data-action="run-command" data-command="projectMemory.deployDefaults">Deploy All Defaults</button></li>
                            </ul>
                        </div>
                        
                        <div class="collapsible" id="activePlansSection">
                            <div class="collapsible-header">
                                <span class="chevron">\u25BC</span>
                                <h3>\u{1F4CB} Active Plans</h3>
                                <span class="count" id="activeCount">0</span>
                            </div>
                            <div class="collapsible-content" id="activePlansList">
                                <div class="empty-state">Loading...</div>
                            </div>
                        </div>
                        
                        <div class="collapsible collapsed" id="archivedPlansSection">
                            <div class="collapsible-header">
                                <span class="chevron">\u25BC</span>
                                <h3>\u{1F4E6} Archived Plans</h3>
                                <span class="count" id="archivedCount">0</span>
                            </div>
                            <div class="collapsible-content" id="archivedPlansList">
                                <div class="empty-state">Loading...</div>
                            </div>
                        </div>
                    \`;
                    
                    // Fetch plans after rendering
                    fetchPlans();
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
</html>`;
  }
};
function getNonce() {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

// src/watchers/AgentWatcher.ts
var vscode2 = __toESM(require("vscode"));
var chokidar = __toESM(require_chokidar());
var path2 = __toESM(require("path"));
function notify2(message, ...items) {
  const config = vscode2.workspace.getConfiguration("projectMemory");
  if (config.get("showNotifications", true)) {
    return vscode2.window.showInformationMessage(message, ...items);
  }
  return Promise.resolve(void 0);
}
var AgentWatcher = class {
  watcher = null;
  agentsRoot;
  autoDeploy;
  constructor(agentsRoot, autoDeploy) {
    this.agentsRoot = agentsRoot;
    this.autoDeploy = autoDeploy;
  }
  start() {
    if (this.watcher) {
      return;
    }
    const pattern = path2.join(this.agentsRoot, "*.agent.md");
    this.watcher = chokidar.watch(pattern, {
      persistent: true,
      ignoreInitial: true
    });
    this.watcher.on("change", async (filePath) => {
      const agentName = path2.basename(filePath, ".agent.md");
      if (this.autoDeploy) {
        notify2(`Deploying updated agent: ${agentName}`);
      } else {
        const action = await notify2(
          `Agent template updated: ${agentName}`,
          "Deploy to All Workspaces",
          "Ignore"
        );
        if (action === "Deploy to All Workspaces") {
          vscode2.commands.executeCommand("projectMemory.deployAgents");
        }
      }
    });
    this.watcher.on("add", (filePath) => {
      const agentName = path2.basename(filePath, ".agent.md");
      notify2(`New agent template detected: ${agentName}`);
    });
    console.log(`Agent watcher started for: ${pattern}`);
  }
  stop() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      console.log("Agent watcher stopped");
    }
  }
  setAutoDeploy(enabled) {
    this.autoDeploy = enabled;
  }
};

// src/watchers/CopilotFileWatcher.ts
var vscode3 = __toESM(require("vscode"));
var chokidar2 = __toESM(require_chokidar());
var path3 = __toESM(require("path"));
function notify3(message, ...items) {
  const config = vscode3.workspace.getConfiguration("projectMemory");
  if (config.get("showNotifications", true)) {
    return vscode3.window.showInformationMessage(message, ...items);
  }
  return Promise.resolve(void 0);
}
var CopilotFileWatcher = class {
  watchers = /* @__PURE__ */ new Map();
  config;
  onFileChange;
  constructor(config) {
    this.config = config;
  }
  start() {
    if (this.config.agentsRoot) {
      this.startWatcher("agent", this.config.agentsRoot, "*.agent.md");
    }
    if (this.config.promptsRoot) {
      this.startWatcher("prompt", this.config.promptsRoot, "*.prompt.md");
    }
    if (this.config.instructionsRoot) {
      this.startWatcher("instruction", this.config.instructionsRoot, "*.instructions.md");
    }
  }
  startWatcher(type, rootPath, pattern) {
    if (this.watchers.has(type)) {
      return;
    }
    const fullPattern = path3.join(rootPath, pattern);
    const watcher = chokidar2.watch(fullPattern, {
      persistent: true,
      ignoreInitial: true
    });
    watcher.on("change", async (filePath) => {
      this.handleFileEvent(type, filePath, "change");
    });
    watcher.on("add", (filePath) => {
      this.handleFileEvent(type, filePath, "add");
    });
    watcher.on("unlink", (filePath) => {
      this.handleFileEvent(type, filePath, "unlink");
    });
    this.watchers.set(type, watcher);
    console.log(`${type} watcher started for: ${fullPattern}`);
  }
  async handleFileEvent(type, filePath, action) {
    const fileName = path3.basename(filePath);
    const typeLabels = {
      agent: "Agent template",
      prompt: "Prompt file",
      instruction: "Instruction file"
    };
    const label = typeLabels[type];
    if (this.onFileChange) {
      this.onFileChange(type, filePath, action);
    }
    if (action === "unlink") {
      vscode3.window.showWarningMessage(`${label} deleted: ${fileName}`);
      return;
    }
    if (action === "add") {
      notify3(`New ${label.toLowerCase()} detected: ${fileName}`);
      return;
    }
    if (this.config.autoDeploy) {
      notify3(`Auto-deploying updated ${label.toLowerCase()}: ${fileName}`);
      this.triggerDeploy(type);
    } else {
      const deployAction = await notify3(
        `${label} updated: ${fileName}`,
        "Deploy to All Workspaces",
        "Ignore"
      );
      if (deployAction === "Deploy to All Workspaces") {
        this.triggerDeploy(type);
      }
    }
  }
  triggerDeploy(type) {
    const commands5 = {
      agent: "projectMemory.deployAgents",
      prompt: "projectMemory.deployPrompts",
      instruction: "projectMemory.deployInstructions"
    };
    vscode3.commands.executeCommand(commands5[type]);
  }
  stop() {
    for (const [type, watcher] of this.watchers) {
      watcher.close();
      console.log(`${type} watcher stopped`);
    }
    this.watchers.clear();
  }
  updateConfig(config) {
    this.stop();
    this.config = { ...this.config, ...config };
    this.start();
  }
  setAutoDeploy(enabled) {
    this.config.autoDeploy = enabled;
  }
  onFileChanged(handler) {
    this.onFileChange = handler;
  }
  getWatchedPaths() {
    const paths = [];
    if (this.config.agentsRoot) {
      paths.push({ type: "agent", path: this.config.agentsRoot });
    }
    if (this.config.promptsRoot) {
      paths.push({ type: "prompt", path: this.config.promptsRoot });
    }
    if (this.config.instructionsRoot) {
      paths.push({ type: "instruction", path: this.config.instructionsRoot });
    }
    return paths;
  }
};

// src/ui/StatusBarManager.ts
var vscode4 = __toESM(require("vscode"));
var StatusBarManager = class {
  statusBarItem;
  currentAgent = null;
  currentPlan = null;
  constructor() {
    this.statusBarItem = vscode4.window.createStatusBarItem(
      vscode4.StatusBarAlignment.Left,
      100
    );
    this.statusBarItem.command = "projectMemory.showDashboard";
    this.updateDisplay();
    this.statusBarItem.show();
  }
  setCurrentAgent(agent) {
    this.currentAgent = agent;
    this.updateDisplay();
  }
  setCurrentPlan(plan) {
    this.currentPlan = plan;
    this.updateDisplay();
  }
  updateDisplay() {
    if (this.currentAgent && this.currentPlan) {
      this.statusBarItem.text = `$(robot) ${this.currentAgent} \xB7 ${this.currentPlan}`;
      this.statusBarItem.tooltip = `Project Memory: ${this.currentAgent} working on "${this.currentPlan}"`;
    } else if (this.currentAgent) {
      this.statusBarItem.text = `$(robot) ${this.currentAgent}`;
      this.statusBarItem.tooltip = `Project Memory: ${this.currentAgent} active`;
    } else {
      this.statusBarItem.text = "$(robot) Project Memory";
      this.statusBarItem.tooltip = "Click to open Project Memory Dashboard";
    }
  }
  /**
   * Show a temporary message in the status bar
   * @param message The message to display
   * @param durationMs How long to show the message (default 3000ms)
   */
  showTemporaryMessage(message, durationMs = 3e3) {
    const previousText = this.statusBarItem.text;
    const previousTooltip = this.statusBarItem.tooltip;
    this.statusBarItem.text = `$(sync~spin) ${message}`;
    this.statusBarItem.tooltip = message;
    setTimeout(() => {
      this.statusBarItem.text = previousText;
      this.statusBarItem.tooltip = previousTooltip;
    }, durationMs);
  }
  /**
   * Update status bar to show Copilot configuration status
   * @param status Object with counts of agents, prompts, instructions
   */
  setCopilotStatus(status) {
    const total = status.agents + status.prompts + status.instructions;
    if (total > 0) {
      this.statusBarItem.text = `$(robot) PM (${status.agents}A/${status.prompts}P/${status.instructions}I)`;
      this.statusBarItem.tooltip = `Project Memory
Agents: ${status.agents}
Prompts: ${status.prompts}
Instructions: ${status.instructions}`;
    } else {
      this.updateDisplay();
    }
  }
  dispose() {
    this.statusBarItem.dispose();
  }
};

// src/server/ServerManager.ts
var vscode5 = __toESM(require("vscode"));
var import_child_process = require("child_process");
var path4 = __toESM(require("path"));
var http = __toESM(require("http"));
function notify4(message, ...items) {
  const config = vscode5.workspace.getConfiguration("projectMemory");
  if (config.get("showNotifications", true)) {
    return vscode5.window.showInformationMessage(message, ...items);
  }
  return Promise.resolve(void 0);
}
var ServerManager = class {
  serverProcess = null;
  frontendProcess = null;
  outputChannel;
  statusBarItem;
  _isRunning = false;
  _isFrontendRunning = false;
  _isExternalServer = false;
  // True if connected to server started by another VS Code instance
  _isExternalFrontend = false;
  config;
  restartAttempts = 0;
  maxRestartAttempts = 3;
  _performanceStats = { apiCalls: 0, avgResponseTime: 0, lastCheck: Date.now() };
  constructor(config) {
    this.config = config;
    this.outputChannel = vscode5.window.createOutputChannel("Project Memory Server");
    this.statusBarItem = vscode5.window.createStatusBarItem(
      vscode5.StatusBarAlignment.Right,
      100
    );
    this.statusBarItem.command = "projectMemory.toggleServer";
  }
  get isRunning() {
    return this._isRunning;
  }
  get isFrontendRunning() {
    return this._isFrontendRunning;
  }
  get isExternalServer() {
    return this._isExternalServer;
  }
  get performanceStats() {
    return { ...this._performanceStats };
  }
  async start() {
    if (this._isRunning) {
      this.log("Server is already running");
      return true;
    }
    const port = this.config.serverPort || 3001;
    this.log(`Checking if server already exists on port ${port}...`);
    const existingServer = await this.checkHealth(port);
    if (existingServer) {
      this.log("Found existing server - connecting without spawning new process");
      this._isRunning = true;
      this._isExternalServer = true;
      this.restartAttempts = 0;
      this.updateStatusBar("connected");
      notify4("Connected to existing Project Memory server");
      return true;
    }
    const serverDir = this.getServerDirectory();
    if (!serverDir) {
      this.log("Dashboard server directory not found");
      return false;
    }
    this.log(`Starting server from: ${serverDir}`);
    this._isExternalServer = false;
    this.updateStatusBar("starting");
    try {
      const env3 = {
        ...process.env,
        PORT: String(this.config.serverPort || 3001),
        WS_PORT: String(this.config.wsPort || 3002),
        MBS_DATA_ROOT: this.config.dataRoot,
        MBS_AGENTS_ROOT: this.config.agentsRoot,
        MBS_PROMPTS_ROOT: this.config.promptsRoot || "",
        MBS_INSTRUCTIONS_ROOT: this.config.instructionsRoot || ""
      };
      const distPath = path4.join(serverDir, "dist", "index.js");
      let command;
      let args;
      const fs2 = require("fs");
      if (fs2.existsSync(distPath)) {
        command = "node";
        args = [distPath];
      } else {
        command = process.platform === "win32" ? "npx.cmd" : "npx";
        args = ["tsx", "src/index.ts"];
      }
      this.serverProcess = (0, import_child_process.spawn)(command, args, {
        cwd: serverDir,
        env: env3,
        shell: true,
        windowsHide: true
      });
      this.serverProcess.stdout?.on("data", (data) => {
        this.log(data.toString().trim());
      });
      this.serverProcess.stderr?.on("data", (data) => {
        this.log(`[stderr] ${data.toString().trim()}`);
      });
      this.serverProcess.on("error", (error) => {
        this.log(`Server error: ${error.message}`);
        this._isRunning = false;
        this.updateStatusBar("error");
      });
      this.serverProcess.on("exit", (code, signal) => {
        this.log(`Server exited with code ${code}, signal ${signal}`);
        this._isRunning = false;
        this.serverProcess = null;
        if (code !== 0 && this.restartAttempts < this.maxRestartAttempts) {
          this.restartAttempts++;
          this.log(`Attempting restart (${this.restartAttempts}/${this.maxRestartAttempts})...`);
          setTimeout(() => this.start(), 2e3);
        } else {
          this.updateStatusBar("stopped");
        }
      });
      const isReady = await this.waitForServer(1e4);
      if (isReady) {
        this._isRunning = true;
        this.restartAttempts = 0;
        this.updateStatusBar("running");
        this.log("Server started successfully");
        return true;
      } else {
        this.log("Server failed to start within timeout");
        this.stop();
        return false;
      }
    } catch (error) {
      this.log(`Failed to start server: ${error}`);
      this.updateStatusBar("error");
      return false;
    }
  }
  async stop() {
    if (this._isExternalServer) {
      this.log("Disconnecting from external server (not stopping it)");
      this._isRunning = false;
      this._isExternalServer = false;
      this.updateStatusBar("stopped");
      return;
    }
    if (!this.serverProcess) {
      return;
    }
    this.log("Stopping server...");
    this.updateStatusBar("stopping");
    return new Promise((resolve) => {
      if (!this.serverProcess) {
        resolve();
        return;
      }
      const timeout = setTimeout(() => {
        if (this.serverProcess) {
          this.log("Force killing server...");
          this.serverProcess.kill("SIGKILL");
        }
        resolve();
      }, 5e3);
      this.serverProcess.on("exit", () => {
        clearTimeout(timeout);
        this._isRunning = false;
        this.serverProcess = null;
        this.updateStatusBar("stopped");
        this.log("Server stopped");
        resolve();
      });
      if (process.platform === "win32") {
        (0, import_child_process.spawn)("taskkill", ["/pid", String(this.serverProcess.pid), "/f", "/t"], {
          windowsHide: true
        });
      } else {
        this.serverProcess.kill("SIGTERM");
      }
    });
  }
  async restart() {
    await this.stop();
    return this.start();
  }
  async startFrontend() {
    if (this._isFrontendRunning) {
      this.log("Frontend is already running");
      return true;
    }
    const existingFrontend = await this.checkPort(5173);
    if (existingFrontend) {
      this.log("Found existing frontend on port 5173 - using it");
      this._isFrontendRunning = true;
      this._isExternalFrontend = true;
      return true;
    }
    const dashboardDir = this.getDashboardDirectory();
    if (!dashboardDir) {
      this.log("Could not find dashboard directory for frontend");
      return false;
    }
    this.log(`Starting frontend from: ${dashboardDir}`);
    try {
      const command = process.platform === "win32" ? "npm.cmd" : "npm";
      const args = ["run", "dev"];
      this.frontendProcess = (0, import_child_process.spawn)(command, args, {
        cwd: dashboardDir,
        shell: true,
        windowsHide: true,
        env: {
          ...process.env,
          VITE_API_URL: `http://localhost:${this.config.serverPort || 3001}`
        }
      });
      this.frontendProcess.stdout?.on("data", (data) => {
        this.log(`[frontend] ${data.toString().trim()}`);
      });
      this.frontendProcess.stderr?.on("data", (data) => {
        this.log(`[frontend] ${data.toString().trim()}`);
      });
      this.frontendProcess.on("error", (error) => {
        this.log(`Frontend error: ${error.message}`);
        this._isFrontendRunning = false;
      });
      this.frontendProcess.on("exit", (code, signal) => {
        this.log(`Frontend exited with code ${code}, signal ${signal}`);
        this._isFrontendRunning = false;
        this.frontendProcess = null;
      });
      const isReady = await this.waitForPort(5173, 15e3);
      if (isReady) {
        this._isFrontendRunning = true;
        this.log("Frontend started successfully on port 5173");
        return true;
      } else {
        this.log("Frontend failed to start within timeout");
        return false;
      }
    } catch (error) {
      this.log(`Failed to start frontend: ${error}`);
      return false;
    }
  }
  async stopFrontend() {
    if (this._isExternalFrontend) {
      this.log("Disconnecting from external frontend (not stopping it)");
      this._isFrontendRunning = false;
      this._isExternalFrontend = false;
      return;
    }
    if (!this.frontendProcess) {
      return;
    }
    this.log("Stopping frontend...");
    return new Promise((resolve) => {
      if (!this.frontendProcess) {
        resolve();
        return;
      }
      const timeout = setTimeout(() => {
        if (this.frontendProcess) {
          this.log("Force killing frontend...");
          this.frontendProcess.kill("SIGKILL");
        }
        resolve();
      }, 5e3);
      this.frontendProcess.on("exit", () => {
        clearTimeout(timeout);
        this._isFrontendRunning = false;
        this.frontendProcess = null;
        this.log("Frontend stopped");
        resolve();
      });
      if (process.platform === "win32") {
        (0, import_child_process.spawn)("taskkill", ["/pid", String(this.frontendProcess.pid), "/f", "/t"], {
          windowsHide: true
        });
      } else {
        this.frontendProcess.kill("SIGTERM");
      }
    });
  }
  getDashboardDirectory() {
    const workspacePath = vscode5.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const extensionPath = vscode5.extensions.getExtension("project-memory.project-memory-dashboard")?.extensionPath;
    const possiblePaths = [
      // Bundled with extension - check this FIRST
      extensionPath ? path4.join(extensionPath, "dashboard") : null,
      // Development workspace (where the extension is being developed)
      "c:\\Users\\codi.f\\vscode_ModularAgenticProcedureSystem\\dashboard",
      "c:\\Users\\User\\Project_Memory_MCP\\Project-Memory-MCP\\dashboard",
      // Current workspace (only if developing in this workspace)
      workspacePath ? path4.join(workspacePath, "dashboard") : null,
      // Sibling to extension
      extensionPath ? path4.join(extensionPath, "..", "dashboard") : null
    ].filter(Boolean);
    const fs2 = require("fs");
    for (const p of possiblePaths) {
      const packageJson = path4.join(p, "package.json");
      if (fs2.existsSync(packageJson)) {
        this.log(`Found dashboard at: ${p}`);
        return p;
      }
    }
    this.log("Could not find dashboard directory for frontend");
    return null;
  }
  async waitForPort(port, timeout) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      try {
        const isOpen = await this.checkPort(port);
        if (isOpen) {
          return true;
        }
      } catch {
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return false;
  }
  checkPort(port) {
    return new Promise((resolve) => {
      const req = http.get(`http://localhost:${port}`, (res) => {
        resolve(res.statusCode !== void 0);
      });
      req.on("error", () => resolve(false));
      req.setTimeout(1e3, () => {
        req.destroy();
        resolve(false);
      });
    });
  }
  updateConfig(config) {
    this.config = { ...this.config, ...config };
    if (this._isRunning) {
      this.restart();
    }
  }
  getServerDirectory() {
    const extensionPath = vscode5.extensions.getExtension("project-memory.project-memory-dashboard")?.extensionPath;
    const workspacePath = vscode5.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const possiblePaths = [
      // Bundled with extension - check FIRST
      extensionPath ? path4.join(extensionPath, "server") : null,
      // Development workspace (where extension is being developed)
      "c:\\Users\\codi.f\\vscode_ModularAgenticProcedureSystem\\dashboard\\server",
      "c:\\Users\\User\\Project_Memory_MCP\\Project-Memory-MCP\\dashboard\\server",
      // Current workspace (only if developing in this workspace)
      workspacePath ? path4.join(workspacePath, "dashboard", "server") : null,
      // Development - relative to extension source
      extensionPath ? path4.join(extensionPath, "..", "dashboard", "server") : null
    ].filter(Boolean);
    const fs2 = require("fs");
    for (const p of possiblePaths) {
      const packageJson = path4.join(p, "package.json");
      if (fs2.existsSync(packageJson)) {
        this.log(`Found server at: ${p}`);
        return p;
      }
    }
    return null;
  }
  hasServerDirectory() {
    return this.getServerDirectory() !== null;
  }
  async waitForServer(timeout) {
    const port = this.config.serverPort || 3001;
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      try {
        const isHealthy = await this.checkHealth(port);
        if (isHealthy) {
          return true;
        }
      } catch {
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return false;
  }
  checkHealth(port) {
    return new Promise((resolve) => {
      const req = http.get(`http://localhost:${port}/api/health`, (res) => {
        resolve(res.statusCode === 200);
      });
      req.on("error", () => resolve(false));
      req.setTimeout(1e3, () => {
        req.destroy();
        resolve(false);
      });
    });
  }
  updateStatusBar(status) {
    const icons = {
      starting: "$(loading~spin)",
      running: "$(check)",
      connected: "$(plug)",
      stopping: "$(loading~spin)",
      stopped: "$(circle-slash)",
      error: "$(error)"
    };
    const colors = {
      running: new vscode5.ThemeColor("statusBarItem.prominentBackground"),
      connected: new vscode5.ThemeColor("statusBarItem.prominentBackground"),
      error: new vscode5.ThemeColor("statusBarItem.errorBackground")
    };
    const labels = {
      starting: "PM Server",
      running: "PM Server (local)",
      connected: "PM Server (shared)",
      stopping: "PM Server",
      stopped: "PM Server",
      error: "PM Server"
    };
    this.statusBarItem.text = `${icons[status]} ${labels[status] || "PM Server"}`;
    this.statusBarItem.tooltip = `Project Memory Server: ${status}${this._isExternalServer ? " (connected to existing)" : ""}
Click to toggle`;
    this.statusBarItem.backgroundColor = colors[status];
    this.statusBarItem.show();
  }
  // Performance monitoring
  async measureApiCall(fn) {
    const start = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - start;
      this._performanceStats.apiCalls++;
      this._performanceStats.avgResponseTime = (this._performanceStats.avgResponseTime * (this._performanceStats.apiCalls - 1) + duration) / this._performanceStats.apiCalls;
      this._performanceStats.lastCheck = Date.now();
      return result;
    } catch (error) {
      throw error;
    }
  }
  log(message) {
    const timestamp = (/* @__PURE__ */ new Date()).toISOString();
    this.outputChannel.appendLine(`[${timestamp}] ${message}`);
  }
  showLogs() {
    this.outputChannel.show();
  }
  dispose() {
    this.stop();
    this.stopFrontend();
    this.outputChannel.dispose();
    this.statusBarItem.dispose();
  }
};

// src/deployer/DefaultDeployer.ts
var vscode6 = __toESM(require("vscode"));
var fs = __toESM(require("fs"));
var path5 = __toESM(require("path"));
var DefaultDeployer = class {
  outputChannel;
  config;
  constructor(config) {
    this.config = config;
    this.outputChannel = vscode6.window.createOutputChannel("Project Memory Deployment");
  }
  updateConfig(config) {
    this.config = { ...this.config, ...config };
  }
  /**
   * Deploy default agents and instructions to a workspace
   */
  async deployToWorkspace(workspacePath) {
    const deployedAgents = [];
    const deployedInstructions = [];
    this.log(`Deploying defaults to workspace: ${workspacePath}`);
    const agentsTargetDir = path5.join(workspacePath, ".github", "agents");
    for (const agentName of this.config.defaultAgents) {
      try {
        const deployed = await this.deployAgent(agentName, agentsTargetDir);
        if (deployed) {
          deployedAgents.push(agentName);
        }
      } catch (error) {
        this.log(`Failed to deploy agent ${agentName}: ${error}`);
      }
    }
    const instructionsTargetDir = path5.join(workspacePath, ".github", "instructions");
    for (const instructionName of this.config.defaultInstructions) {
      try {
        const deployed = await this.deployInstruction(instructionName, instructionsTargetDir);
        if (deployed) {
          deployedInstructions.push(instructionName);
        }
      } catch (error) {
        this.log(`Failed to deploy instruction ${instructionName}: ${error}`);
      }
    }
    this.log(`Deployed ${deployedAgents.length} agents, ${deployedInstructions.length} instructions`);
    return { agents: deployedAgents, instructions: deployedInstructions };
  }
  /**
   * Deploy a single agent file
   */
  async deployAgent(agentName, targetDir) {
    const sourcePath = path5.join(this.config.agentsRoot, `${agentName}.agent.md`);
    const targetPath = path5.join(targetDir, `${agentName}.agent.md`);
    return this.copyFile(sourcePath, targetPath);
  }
  /**
   * Deploy a single instruction file
   */
  async deployInstruction(instructionName, targetDir) {
    const sourcePath = path5.join(this.config.instructionsRoot, `${instructionName}.instructions.md`);
    const targetPath = path5.join(targetDir, `${instructionName}.instructions.md`);
    return this.copyFile(sourcePath, targetPath);
  }
  /**
   * Update deployed files in a workspace (sync with source)
   */
  async updateWorkspace(workspacePath) {
    const updated = [];
    const added = [];
    const agentsDir = path5.join(workspacePath, ".github", "agents");
    const instructionsDir = path5.join(workspacePath, ".github", "instructions");
    for (const agentName of this.config.defaultAgents) {
      const sourcePath = path5.join(this.config.agentsRoot, `${agentName}.agent.md`);
      const targetPath = path5.join(agentsDir, `${agentName}.agent.md`);
      if (!fs.existsSync(sourcePath)) continue;
      if (fs.existsSync(targetPath)) {
        const sourceStats = fs.statSync(sourcePath);
        const targetStats = fs.statSync(targetPath);
        if (sourceStats.mtimeMs > targetStats.mtimeMs) {
          await this.copyFile(sourcePath, targetPath, true);
          updated.push(agentName);
        }
      } else {
        await this.copyFile(sourcePath, targetPath);
        added.push(agentName);
      }
    }
    for (const instructionName of this.config.defaultInstructions) {
      const sourcePath = path5.join(this.config.instructionsRoot, `${instructionName}.instructions.md`);
      const targetPath = path5.join(instructionsDir, `${instructionName}.instructions.md`);
      if (!fs.existsSync(sourcePath)) continue;
      if (fs.existsSync(targetPath)) {
        const sourceStats = fs.statSync(sourcePath);
        const targetStats = fs.statSync(targetPath);
        if (sourceStats.mtimeMs > targetStats.mtimeMs) {
          await this.copyFile(sourcePath, targetPath, true);
          updated.push(instructionName);
        }
      } else {
        await this.copyFile(sourcePath, targetPath);
        added.push(instructionName);
      }
    }
    return { updated, added };
  }
  /**
   * List what would be deployed (dry run)
   */
  getDeploymentPlan() {
    const agents = this.config.defaultAgents.filter((name) => {
      const sourcePath = path5.join(this.config.agentsRoot, `${name}.agent.md`);
      return fs.existsSync(sourcePath);
    });
    const instructions = this.config.defaultInstructions.filter((name) => {
      const sourcePath = path5.join(this.config.instructionsRoot, `${name}.instructions.md`);
      return fs.existsSync(sourcePath);
    });
    return { agents, instructions };
  }
  async copyFile(sourcePath, targetPath, overwrite = false) {
    if (!fs.existsSync(sourcePath)) {
      this.log(`Source not found: ${sourcePath}`);
      return false;
    }
    if (fs.existsSync(targetPath) && !overwrite) {
      this.log(`Target exists, skipping: ${targetPath}`);
      return false;
    }
    const targetDir = path5.dirname(targetPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    fs.copyFileSync(sourcePath, targetPath);
    this.log(`Copied: ${sourcePath} -> ${targetPath}`);
    return true;
  }
  log(message) {
    const timestamp = (/* @__PURE__ */ new Date()).toISOString();
    this.outputChannel.appendLine(`[${timestamp}] ${message}`);
  }
  showLogs() {
    this.outputChannel.show();
  }
  dispose() {
    this.outputChannel.dispose();
  }
};

// src/ui/DashboardPanel.ts
var vscode7 = __toESM(require("vscode"));
var DashboardPanel = class _DashboardPanel {
  static currentPanel;
  _panel;
  _disposables = [];
  static viewType = "projectMemory.dashboard";
  constructor(panel, extensionUri, dashboardUrl) {
    this._panel = panel;
    this._update(dashboardUrl);
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage(
      (message) => {
        switch (message.type) {
          case "alert":
            vscode7.window.showInformationMessage(message.text);
            break;
        }
      },
      null,
      this._disposables
    );
  }
  static createOrShow(extensionUri, dashboardUrl) {
    const column = vscode7.window.activeTextEditor ? vscode7.window.activeTextEditor.viewColumn : void 0;
    if (_DashboardPanel.currentPanel) {
      _DashboardPanel.currentPanel._panel.reveal(column);
      _DashboardPanel.currentPanel._update(dashboardUrl);
      return;
    }
    const panel = vscode7.window.createWebviewPanel(
      _DashboardPanel.viewType,
      "\u{1F9E0} PMD",
      column || vscode7.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri]
      }
    );
    _DashboardPanel.currentPanel = new _DashboardPanel(panel, extensionUri, dashboardUrl);
  }
  static revive(panel, extensionUri, dashboardUrl) {
    _DashboardPanel.currentPanel = new _DashboardPanel(panel, extensionUri, dashboardUrl);
  }
  _update(dashboardUrl) {
    const webview = this._panel.webview;
    this._panel.title = "\u{1F9E0} PMD";
    this._panel.iconPath = {
      light: vscode7.Uri.joinPath(vscode7.Uri.file(__dirname), "..", "resources", "icon.svg"),
      dark: vscode7.Uri.joinPath(vscode7.Uri.file(__dirname), "..", "resources", "icon.svg")
    };
    webview.html = this._getHtmlForWebview(webview, dashboardUrl);
  }
  _getHtmlForWebview(webview, dashboardUrl) {
    const nonce = getNonce2();
    return `<!DOCTYPE html>
<html lang="en" style="height: 100%; margin: 0; padding: 0;">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src ${dashboardUrl} http://localhost:*; style-src 'unsafe-inline';">
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
        src="${dashboardUrl}"
        title="Project Memory Dashboard"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
    ></iframe>
    
    <script nonce="${nonce}">
        (function() {
            const iframe = document.getElementById('dashboard-frame');
            if (iframe) {
                iframe.onerror = function() {
                    document.body.innerHTML = \`
                        <div class="error">
                            <h2>Unable to load dashboard</h2>
                            <p>Make sure the dashboard server is running on ${dashboardUrl}</p>
                            <button onclick="location.reload()">Retry</button>
                        </div>
                    \`;
                };
            }
        })();
    </script>
</body>
</html>`;
  }
  dispose() {
    _DashboardPanel.currentPanel = void 0;
    this._panel.dispose();
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
};
function getNonce2() {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

// src/chat/McpBridge.ts
var vscode8 = __toESM(require("vscode"));
var http2 = __toESM(require("http"));
var crypto2 = __toESM(require("crypto"));
var McpBridge = class {
  connected = false;
  serverPort = 3001;
  serverHost = "localhost";
  outputChannel;
  reconnectAttempts = 0;
  maxReconnectAttempts = 3;
  reconnectDelay = 1e3;
  config;
  _onConnectionChange = new vscode8.EventEmitter();
  onConnectionChange = this._onConnectionChange.event;
  constructor(config) {
    this.config = config;
    this.outputChannel = vscode8.window.createOutputChannel("Project Memory MCP Bridge");
    const vsConfig = vscode8.workspace.getConfiguration("projectMemory");
    this.serverPort = vsConfig.get("serverPort") || 3001;
  }
  /**
   * Connect to the shared server (verify it's running)
   */
  async connect() {
    if (this.connected) {
      this.log("Already connected");
      return;
    }
    try {
      const health = await this.httpGet("/api/health");
      if (health.status === "ok") {
        this.connected = true;
        this.reconnectAttempts = 0;
        this._onConnectionChange.fire(true);
        this.log(`Connected to shared server at localhost:${this.serverPort}`);
        this.log(`Data root: ${health.dataRoot}`);
      } else {
        throw new Error("Server health check failed");
      }
    } catch (error) {
      this.log(`Connection failed: ${error}`);
      this.connected = false;
      this._onConnectionChange.fire(false);
      throw new Error(
        "Could not connect to Project Memory server.\nPlease ensure the server is running (check PM Server status bar item)."
      );
    }
  }
  /**
   * Disconnect from the server
   */
  async disconnect() {
    if (!this.connected) {
      return;
    }
    this.connected = false;
    this._onConnectionChange.fire(false);
    this.log("Disconnected from server");
  }
  /**
   * Check if connected to the server
   */
  isConnected() {
    return this.connected;
  }
  /**
   * Attempt to reconnect to the server
   */
  async reconnect() {
    this.connected = false;
    this._onConnectionChange.fire(false);
    await this.connect();
  }
  /**
   * Call a tool by name - maps MCP tool names to HTTP API calls
   */
  async callTool(name, args) {
    if (!this.connected) {
      throw new Error("Not connected to Project Memory server");
    }
    this.log(`Calling tool: ${name} with args: ${JSON.stringify(args)}`);
    try {
      const result = await this.mapToolToHttp(name, args);
      this.log(`Tool ${name} result: ${JSON.stringify(result).substring(0, 200)}...`);
      return result;
    } catch (error) {
      this.log(`Tool ${name} error: ${error}`);
      throw error;
    }
  }
  /**
   * Map MCP tool names to HTTP API calls
   */
  async mapToolToHttp(toolName, args) {
    switch (toolName) {
      // Workspace tools
      case "register_workspace":
        return this.registerWorkspace(args.workspace_path);
      case "get_workspace_info":
        return this.httpGet(`/api/workspaces/${args.workspace_id}`);
      case "list_workspaces":
        return this.httpGet("/api/workspaces");
      // Plan tools  
      case "create_plan":
        return this.httpPost(`/api/plans/${args.workspace_id}`, {
          title: args.title,
          description: args.description,
          category: args.category || "feature",
          priority: args.priority || "medium"
        });
      case "get_plan_state":
        return this.httpGet(`/api/plans/${args.workspace_id}/${args.plan_id}`);
      case "list_plans":
        const plansResult = await this.httpGet(
          `/api/plans/workspace/${args.workspace_id}`
        );
        return { active_plans: plansResult.plans, total: plansResult.total };
      case "update_step":
        return this.httpPut(
          `/api/plans/${args.workspace_id}/${args.plan_id}/steps/${args.step_id}`,
          { status: args.status, notes: args.notes }
        );
      case "append_steps":
        return this.httpPost(
          `/api/plans/${args.workspace_id}/${args.plan_id}/steps`,
          { steps: args.steps }
        );
      case "add_note":
        return this.httpPost(
          `/api/plans/${args.workspace_id}/${args.plan_id}/notes`,
          { note: args.note, type: args.type || "info" }
        );
      // Handoff tools
      case "handoff":
        return this.httpPost(
          `/api/plans/${args.workspace_id}/${args.plan_id}/handoff`,
          {
            from_agent: args.from_agent,
            to_agent: args.to_agent,
            summary: args.summary,
            artifacts: args.artifacts
          }
        );
      case "get_lineage":
        return this.httpGet(`/api/plans/${args.workspace_id}/${args.plan_id}/lineage`);
      // Context tools
      case "store_context":
        return this.httpPost(
          `/api/plans/${args.workspace_id}/${args.plan_id}/context`,
          { type: args.type, data: args.data }
        );
      case "get_context":
        return this.httpGet(
          `/api/plans/${args.workspace_id}/${args.plan_id}/context/${args.type}`
        );
      // Agent tools
      case "initialise_agent":
        return this.httpPost("/api/agents/initialise", args);
      case "complete_agent":
        return this.httpPost("/api/agents/complete", args);
      // Search
      case "search":
        return this.httpGet(`/api/search?q=${encodeURIComponent(args.query)}`);
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }
  /**
   * Register a workspace - creates workspace entry if needed
   */
  async registerWorkspace(workspacePath) {
    const workspaces = await this.httpGet("/api/workspaces");
    const existing = workspaces.workspaces.find(
      (w) => w.path?.toLowerCase() === workspacePath.toLowerCase()
    );
    if (existing) {
      return { workspace: { workspace_id: existing.id } };
    }
    const workspaceId = this.pathToWorkspaceId(workspacePath);
    return { workspace: { workspace_id: workspaceId } };
  }
  /**
   * Convert a workspace path to a workspace ID
   */
  pathToWorkspaceId(workspacePath) {
    const folderName = workspacePath.split(/[/\\]/).filter(Boolean).pop() || "workspace";
    const hash = crypto2.createHash("sha256").update(workspacePath).digest("hex").substring(0, 12);
    return `${folderName}-${hash}`;
  }
  /**
   * List available tools (for compatibility)
   */
  async listTools() {
    return [
      { name: "register_workspace", description: "Register a workspace" },
      { name: "list_workspaces", description: "List all workspaces" },
      { name: "get_workspace_info", description: "Get workspace details" },
      { name: "create_plan", description: "Create a new plan" },
      { name: "get_plan_state", description: "Get plan state" },
      { name: "list_plans", description: "List plans for a workspace" },
      { name: "update_step", description: "Update a plan step" },
      { name: "append_steps", description: "Add steps to a plan" },
      { name: "add_note", description: "Add a note to a plan" },
      { name: "handoff", description: "Hand off between agents" },
      { name: "get_lineage", description: "Get handoff lineage" },
      { name: "store_context", description: "Store context data" },
      { name: "get_context", description: "Get context data" },
      { name: "initialise_agent", description: "Initialize an agent session" },
      { name: "complete_agent", description: "Complete an agent session" },
      { name: "search", description: "Search across workspaces" }
    ];
  }
  /**
   * Show logs output channel
   */
  showLogs() {
    this.outputChannel.show();
  }
  /**
   * Dispose resources
   */
  dispose() {
    this.disconnect();
    this._onConnectionChange.dispose();
    this.outputChannel.dispose();
  }
  /**
   * Log message to output channel
   */
  log(message) {
    const timestamp = (/* @__PURE__ */ new Date()).toISOString();
    this.outputChannel.appendLine(`[${timestamp}] ${message}`);
    console.log(`[MCP Bridge] ${message}`);
  }
  // ==========================================================================
  // HTTP Helpers
  // ==========================================================================
  /**
   * Make an HTTP GET request
   */
  httpGet(path6) {
    return new Promise((resolve, reject) => {
      const url = `http://${this.serverHost}:${this.serverPort}${path6}`;
      this.log(`GET ${url}`);
      const req = http2.get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => data += chunk);
        res.on("end", () => {
          try {
            if (res.statusCode && res.statusCode >= 400) {
              reject(new Error(`HTTP ${res.statusCode}: ${data}`));
              return;
            }
            const parsed = JSON.parse(data);
            resolve(parsed);
          } catch (e) {
            reject(new Error(`Failed to parse response: ${data}`));
          }
        });
      });
      req.on("error", reject);
      req.setTimeout(1e4, () => {
        req.destroy();
        reject(new Error("Request timeout"));
      });
    });
  }
  /**
   * Make an HTTP POST request
   */
  httpPost(path6, body) {
    return this.httpRequest("POST", path6, body);
  }
  /**
   * Make an HTTP PUT request
   */
  httpPut(path6, body) {
    return this.httpRequest("PUT", path6, body);
  }
  /**
   * Make an HTTP request with body
   */
  httpRequest(method, path6, body) {
    return new Promise((resolve, reject) => {
      const jsonBody = JSON.stringify(body);
      const url = `http://${this.serverHost}:${this.serverPort}${path6}`;
      this.log(`${method} ${url}`);
      const options = {
        hostname: this.serverHost,
        port: this.serverPort,
        path: path6,
        method,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(jsonBody)
        }
      };
      const req = http2.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => data += chunk);
        res.on("end", () => {
          try {
            if (res.statusCode && res.statusCode >= 400) {
              reject(new Error(`HTTP ${res.statusCode}: ${data}`));
              return;
            }
            const parsed = JSON.parse(data);
            resolve(parsed);
          } catch (e) {
            reject(new Error(`Failed to parse response: ${data}`));
          }
        });
      });
      req.on("error", reject);
      req.setTimeout(1e4, () => {
        req.destroy();
        reject(new Error("Request timeout"));
      });
      req.write(jsonBody);
      req.end();
    });
  }
};

// src/chat/ChatParticipant.ts
var vscode9 = __toESM(require("vscode"));
var ChatParticipant = class {
  participant;
  mcpBridge;
  workspaceId = null;
  constructor(mcpBridge2) {
    this.mcpBridge = mcpBridge2;
    this.participant = vscode9.chat.createChatParticipant(
      "project-memory.memory",
      this.handleRequest.bind(this)
    );
    this.participant.iconPath = new vscode9.ThemeIcon("book");
    this.participant.followupProvider = {
      provideFollowups: this.provideFollowups.bind(this)
    };
  }
  /**
   * Handle chat requests
   */
  async handleRequest(request2, context, response, token) {
    if (!this.mcpBridge.isConnected()) {
      response.markdown('\u26A0\uFE0F **Not connected to MCP server**\n\nUse the "Project Memory: Reconnect Chat to MCP Server" command to reconnect.');
      return { metadata: { command: "error" } };
    }
    await this.ensureWorkspaceRegistered(response);
    try {
      switch (request2.command) {
        case "plan":
          return await this.handlePlanCommand(request2, response, token);
        case "context":
          return await this.handleContextCommand(request2, response, token);
        case "handoff":
          return await this.handleHandoffCommand(request2, response, token);
        case "status":
          return await this.handleStatusCommand(request2, response, token);
        default:
          return await this.handleDefaultCommand(request2, response, token);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      response.markdown(`\u274C **Error**: ${errorMessage}`);
      return { metadata: { command: "error" } };
    }
  }
  /**
   * Ensure the current workspace is registered with the MCP server
   */
  async ensureWorkspaceRegistered(response) {
    if (this.workspaceId) return;
    const workspaceFolder = vscode9.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      response.markdown("\u26A0\uFE0F No workspace folder open. Please open a folder first.\n");
      return;
    }
    if (!this.mcpBridge.isConnected()) {
      response.markdown("\u26A0\uFE0F MCP server not connected. Click the MCP status bar item to reconnect.\n");
      return;
    }
    try {
      console.log(`Registering workspace: ${workspaceFolder.uri.fsPath}`);
      const result = await this.mcpBridge.callTool(
        "register_workspace",
        { workspace_path: workspaceFolder.uri.fsPath }
      );
      console.log(`Register workspace result: ${JSON.stringify(result)}`);
      if (result.workspace?.workspace_id) {
        this.workspaceId = result.workspace.workspace_id;
        console.log(`Workspace registered: ${this.workspaceId}`);
      } else {
        console.error("Unexpected response format:", result);
        response.markdown(`\u26A0\uFE0F Unexpected response from MCP server. Check console for details.
`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("Failed to register workspace:", error);
      response.markdown(`\u26A0\uFE0F Failed to register workspace: ${errorMessage}
`);
    }
  }
  /**
   * Handle /plan command - view, create, or manage plans
   */
  async handlePlanCommand(request2, response, token) {
    const prompt = request2.prompt.trim();
    if (!prompt || prompt === "list") {
      return await this.listPlans(response);
    }
    if (prompt.startsWith("create ")) {
      return await this.createPlan(prompt.substring(7), response);
    }
    if (prompt.startsWith("show ")) {
      const planId = prompt.substring(5).trim();
      return await this.showPlan(planId, response);
    }
    response.markdown("\u{1F4CB} **Plan Commands**\n\n");
    response.markdown("- `/plan list` - List all plans in this workspace\n");
    response.markdown("- `/plan create <title>` - Create a new plan\n");
    response.markdown("- `/plan show <plan-id>` - Show plan details\n");
    response.markdown("\nOr just describe what you want to do and I'll help create a plan.");
    return { metadata: { command: "plan" } };
  }
  /**
   * List all plans in the workspace
   */
  async listPlans(response) {
    if (!this.workspaceId) {
      response.markdown("\u26A0\uFE0F Workspace not registered.");
      return { metadata: { command: "plan" } };
    }
    const result = await this.mcpBridge.callTool(
      "list_plans",
      { workspace_id: this.workspaceId }
    );
    const plans = result.active_plans || [];
    if (plans.length === 0) {
      response.markdown("\u{1F4CB} **No plans found**\n\nUse `/plan create <title>` to create a new plan.");
      return { metadata: { command: "plan" } };
    }
    response.markdown(`\u{1F4CB} **Plans in this workspace** (${plans.length})

`);
    for (const plan of plans) {
      const statusEmoji = this.getStatusEmoji(plan.status);
      response.markdown(`${statusEmoji} **${plan.title}** \`${plan.plan_id}\`
`);
      if (plan.category) {
        response.markdown(`   Category: ${plan.category}
`);
      }
    }
    return { metadata: { command: "plan", plans: plans.length } };
  }
  /**
   * Create a new plan
   */
  async createPlan(description, response) {
    if (!this.workspaceId) {
      response.markdown("\u26A0\uFE0F Workspace not registered.");
      return { metadata: { command: "plan" } };
    }
    response.markdown(`\u{1F504} Creating plan: **${description}**...

`);
    const result = await this.mcpBridge.callTool(
      "create_plan",
      {
        workspace_id: this.workspaceId,
        title: description,
        description,
        category: "feature"
        // Default category
      }
    );
    response.markdown(`\u2705 **Plan created!**

`);
    response.markdown(`- **ID**: \`${result.plan_id}\`
`);
    response.markdown(`- **Title**: ${result.title}
`);
    response.markdown(`
Use \`/plan show ${result.plan_id}\` to see details.`);
    return { metadata: { command: "plan", action: "created", planId: result.plan_id } };
  }
  /**
   * Show details of a specific plan
   */
  async showPlan(planId, response) {
    if (!this.workspaceId) {
      response.markdown("\u26A0\uFE0F Workspace not registered.");
      return { metadata: { command: "plan" } };
    }
    const result = await this.mcpBridge.callTool(
      "get_plan_state",
      {
        workspace_id: this.workspaceId,
        plan_id: planId
      }
    );
    response.markdown(`# \u{1F4CB} ${result.title}

`);
    response.markdown(`**ID**: \`${result.plan_id}\`
`);
    if (result.category) {
      response.markdown(`**Category**: ${result.category}
`);
    }
    if (result.priority) {
      response.markdown(`**Priority**: ${result.priority}
`);
    }
    if (result.description) {
      response.markdown(`
${result.description}
`);
    }
    if (result.steps && result.steps.length > 0) {
      response.markdown("\n## Steps\n\n");
      for (let i = 0; i < result.steps.length; i++) {
        const step = result.steps[i];
        const statusEmoji = this.getStepStatusEmoji(step.status);
        response.markdown(`${statusEmoji} **${step.phase}**: ${step.task}
`);
      }
    }
    if (result.lineage && result.lineage.length > 0) {
      response.markdown("\n## Agent History\n\n");
      for (const session of result.lineage) {
        response.markdown(`- **${session.agent_type}** (${session.started_at})
`);
        if (session.summary) {
          response.markdown(`  ${session.summary}
`);
        }
      }
    }
    return { metadata: { command: "plan", action: "show", planId } };
  }
  /**
   * Handle /context command - get workspace context
   */
  async handleContextCommand(request2, response, token) {
    if (!this.workspaceId) {
      response.markdown("\u26A0\uFE0F Workspace not registered.");
      return { metadata: { command: "context" } };
    }
    response.markdown("\u{1F50D} **Gathering workspace context...**\n\n");
    try {
      const result = await this.mcpBridge.callTool(
        "get_workspace_info",
        { workspace_id: this.workspaceId }
      );
      response.markdown(`## Workspace Information

`);
      response.markdown(`**ID**: \`${result.workspace_id}\`
`);
      response.markdown(`**Path**: \`${result.workspace_path}\`
`);
      if (result.codebase_profile) {
        const profile = result.codebase_profile;
        response.markdown("\n## Codebase Profile\n\n");
        if (profile.languages && profile.languages.length > 0) {
          response.markdown(`**Languages**: ${profile.languages.join(", ")}
`);
        }
        if (profile.frameworks && profile.frameworks.length > 0) {
          response.markdown(`**Frameworks**: ${profile.frameworks.join(", ")}
`);
        }
        if (profile.file_count) {
          response.markdown(`**Files**: ${profile.file_count}
`);
        }
      }
    } catch (error) {
      response.markdown(`\u26A0\uFE0F Could not retrieve full context. Basic workspace info:

`);
      response.markdown(`**Workspace ID**: \`${this.workspaceId}\`
`);
    }
    return { metadata: { command: "context" } };
  }
  /**
   * Handle /handoff command - execute agent handoffs
   */
  async handleHandoffCommand(request2, response, token) {
    const prompt = request2.prompt.trim();
    if (!prompt) {
      response.markdown("\u{1F91D} **Handoff Command**\n\n");
      response.markdown("Usage: `/handoff <agent-type> <plan-id> [summary]`\n\n");
      response.markdown("**Available agents:**\n");
      response.markdown("- `Coordinator` - Orchestrates the workflow\n");
      response.markdown("- `Researcher` - Gathers external information\n");
      response.markdown("- `Architect` - Creates implementation plans\n");
      response.markdown("- `Executor` - Implements the plan\n");
      response.markdown("- `Reviewer` - Validates completed work\n");
      response.markdown("- `Tester` - Writes and runs tests\n");
      response.markdown("- `Archivist` - Finalizes and archives\n");
      return { metadata: { command: "handoff" } };
    }
    const parts = prompt.split(" ");
    if (parts.length < 2) {
      response.markdown("\u26A0\uFE0F Please provide both agent type and plan ID.\n");
      response.markdown("Example: `/handoff Executor plan_abc123`");
      return { metadata: { command: "handoff" } };
    }
    const targetAgent = parts[0];
    const planId = parts[1];
    const summary = parts.slice(2).join(" ") || "Handoff from chat";
    if (!this.workspaceId) {
      response.markdown("\u26A0\uFE0F Workspace not registered.");
      return { metadata: { command: "handoff" } };
    }
    response.markdown(`\u{1F504} Initiating handoff to **${targetAgent}**...

`);
    try {
      await this.mcpBridge.callTool("handoff", {
        workspace_id: this.workspaceId,
        plan_id: planId,
        target_agent: targetAgent,
        summary
      });
      response.markdown(`\u2705 **Handoff complete!**

`);
      response.markdown(`Plan \`${planId}\` has been handed off to **${targetAgent}**.
`);
      response.markdown(`The agent file should be invoked to continue work.`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      response.markdown(`\u274C Handoff failed: ${errorMessage}`);
    }
    return { metadata: { command: "handoff", targetAgent, planId } };
  }
  /**
   * Handle /status command - show current plan progress
   */
  async handleStatusCommand(request2, response, token) {
    if (!this.workspaceId) {
      response.markdown("\u26A0\uFE0F Workspace not registered.");
      return { metadata: { command: "status" } };
    }
    response.markdown("\u{1F4CA} **Project Memory Status**\n\n");
    const connected = this.mcpBridge.isConnected();
    response.markdown(`**MCP Server**: ${connected ? "\u{1F7E2} Connected" : "\u{1F534} Disconnected"}
`);
    response.markdown(`**Workspace ID**: \`${this.workspaceId}\`

`);
    try {
      const result = await this.mcpBridge.callTool(
        "list_plans",
        { workspace_id: this.workspaceId }
      );
      const plans = result.active_plans || [];
      const activePlans = plans.filter((p) => p.status !== "archived");
      response.markdown(`## Active Plans (${activePlans.length})

`);
      if (activePlans.length === 0) {
        response.markdown("No active plans.\n");
      } else {
        for (const plan of activePlans) {
          const statusEmoji = this.getStatusEmoji(plan.status);
          const doneSteps = plan.done_steps || 0;
          const totalSteps = plan.total_steps || 0;
          response.markdown(`${statusEmoji} **${plan.title}**
`);
          if (totalSteps > 0) {
            response.markdown(`   Progress: ${doneSteps}/${totalSteps} steps
`);
          }
        }
      }
    } catch (error) {
      response.markdown("Could not retrieve plan status.\n");
    }
    return { metadata: { command: "status" } };
  }
  /**
   * Handle default (no command) requests
   */
  async handleDefaultCommand(request2, response, token) {
    const prompt = request2.prompt.trim();
    if (!prompt) {
      response.markdown("\u{1F44B} **Welcome to Project Memory!**\n\n");
      response.markdown("I can help you manage project plans and agent workflows.\n\n");
      response.markdown("**Available commands:**\n");
      response.markdown("- `/plan` - View, create, or manage plans\n");
      response.markdown("- `/context` - Get workspace context and codebase profile\n");
      response.markdown("- `/handoff` - Execute agent handoffs\n");
      response.markdown("- `/status` - Show current plan progress\n");
      response.markdown("\nOr just ask me about your project!");
      return { metadata: { command: "help" } };
    }
    if (prompt.toLowerCase().includes("plan") || prompt.toLowerCase().includes("create")) {
      response.markdown(`I can help you with plans!

`);
      response.markdown(`Try using the \`/plan\` command:
`);
      response.markdown(`- \`/plan list\` to see existing plans
`);
      response.markdown(`- \`/plan create ${prompt}\` to create a new plan
`);
    } else if (prompt.toLowerCase().includes("status") || prompt.toLowerCase().includes("progress")) {
      return await this.handleStatusCommand(request2, response, token);
    } else {
      response.markdown(`I understand you want to: **${prompt}**

`);
      response.markdown(`Here's what I can help with:
`);
      response.markdown(`- Use \`/plan create ${prompt}\` to create a plan for this
`);
      response.markdown(`- Use \`/status\` to check current progress
`);
      response.markdown(`- Use \`/context\` to get workspace information
`);
    }
    return { metadata: { command: "default" } };
  }
  /**
   * Provide follow-up suggestions
   */
  provideFollowups(result, context, token) {
    const metadata = result.metadata;
    const command = metadata?.command;
    const followups = [];
    switch (command) {
      case "plan":
        if (metadata?.action === "created" && metadata?.planId) {
          followups.push({
            prompt: `/plan show ${metadata.planId}`,
            label: "View plan details",
            command: "plan"
          });
        }
        followups.push({
          prompt: "/status",
          label: "Check status",
          command: "status"
        });
        break;
      case "status":
        followups.push({
          prompt: "/plan list",
          label: "List all plans",
          command: "plan"
        });
        break;
      case "help":
      case "default":
        followups.push({
          prompt: "/plan list",
          label: "List plans",
          command: "plan"
        });
        followups.push({
          prompt: "/status",
          label: "Check status",
          command: "status"
        });
        break;
    }
    return followups;
  }
  /**
   * Get emoji for plan status
   */
  getStatusEmoji(status) {
    switch (status) {
      case "active":
        return "\u{1F535}";
      case "completed":
        return "\u2705";
      case "archived":
        return "\u{1F4E6}";
      case "blocked":
        return "\u{1F534}";
      default:
        return "\u26AA";
    }
  }
  /**
   * Get emoji for step status
   */
  getStepStatusEmoji(status) {
    switch (status) {
      case "done":
        return "\u2705";
      case "active":
        return "\u{1F504}";
      case "blocked":
        return "\u{1F534}";
      default:
        return "\u2B1C";
    }
  }
  /**
   * Reset workspace ID (useful when workspace changes)
   */
  resetWorkspace() {
    this.workspaceId = null;
  }
  /**
   * Dispose of resources
   */
  dispose() {
    this.participant.dispose();
  }
};

// src/chat/ToolProvider.ts
var vscode10 = __toESM(require("vscode"));
var ToolProvider = class {
  mcpBridge;
  workspaceId = null;
  disposables = [];
  constructor(mcpBridge2) {
    this.mcpBridge = mcpBridge2;
    this.registerTools();
  }
  /**
   * Register all language model tools
   */
  registerTools() {
    this.disposables.push(
      vscode10.lm.registerTool("memory_plan", {
        invoke: async (options, token) => {
          return await this.handlePlan(
            options,
            token
          );
        }
      })
    );
    this.disposables.push(
      vscode10.lm.registerTool("memory_steps", {
        invoke: async (options, token) => {
          return await this.handleSteps(
            options,
            token
          );
        }
      })
    );
    this.disposables.push(
      vscode10.lm.registerTool("memory_context", {
        invoke: async (options, token) => {
          return await this.handleContext(
            options,
            token
          );
        }
      })
    );
  }
  /**
   * Ensure workspace is registered
   */
  async ensureWorkspace() {
    if (this.workspaceId) {
      return this.workspaceId;
    }
    const workspaceFolder = vscode10.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      throw new Error("No workspace folder open");
    }
    const result = await this.mcpBridge.callTool(
      "memory_workspace",
      { action: "register", workspace_path: workspaceFolder.uri.fsPath }
    );
    this.workspaceId = result.workspace_id;
    return this.workspaceId;
  }
  /**
   * Handle memory_plan tool invocation
   */
  async handlePlan(options, token) {
    try {
      if (!this.mcpBridge.isConnected()) {
        return this.errorResult("MCP server not connected");
      }
      const workspaceId = await this.ensureWorkspace();
      const { action, planId, title, description, category, priority, includeArchived } = options.input;
      let result;
      switch (action) {
        case "list":
          const listResult = await this.mcpBridge.callTool("memory_plan", {
            action: "list",
            workspace_id: workspaceId,
            include_archived: includeArchived
          });
          result = {
            workspace_id: workspaceId,
            plans: listResult.active_plans || [],
            total: (listResult.active_plans || []).length,
            message: (listResult.active_plans || []).length > 0 ? `Found ${(listResult.active_plans || []).length} plan(s)` : 'No plans found. Use action "create" to create one.'
          };
          break;
        case "get":
          if (!planId) {
            return this.errorResult("planId is required for get action");
          }
          result = await this.mcpBridge.callTool("memory_plan", {
            action: "get",
            workspace_id: workspaceId,
            plan_id: planId
          });
          break;
        case "create":
          if (!title || !description) {
            return this.errorResult("title and description are required for create action");
          }
          result = await this.mcpBridge.callTool("memory_plan", {
            action: "create",
            workspace_id: workspaceId,
            title,
            description,
            category: category || "feature",
            priority: priority || "medium"
          });
          break;
        case "archive":
          if (!planId) {
            return this.errorResult("planId is required for archive action");
          }
          result = await this.mcpBridge.callTool("memory_plan", {
            action: "archive",
            workspace_id: workspaceId,
            plan_id: planId
          });
          break;
        default:
          return this.errorResult(`Unknown action: ${action}`);
      }
      return new vscode10.LanguageModelToolResult([
        new vscode10.LanguageModelTextPart(JSON.stringify(result, null, 2))
      ]);
    } catch (error) {
      return this.errorResult(error);
    }
  }
  /**
   * Handle memory_steps tool invocation
   */
  async handleSteps(options, token) {
    try {
      if (!this.mcpBridge.isConnected()) {
        return this.errorResult("MCP server not connected");
      }
      const workspaceId = await this.ensureWorkspace();
      const { action, planId, stepIndex, status, notes, updates, newSteps } = options.input;
      if (!planId) {
        return this.errorResult("planId is required");
      }
      let result;
      switch (action) {
        case "update":
          if (stepIndex === void 0 || !status) {
            return this.errorResult("stepIndex and status are required for update action");
          }
          result = await this.mcpBridge.callTool("memory_steps", {
            action: "update",
            workspace_id: workspaceId,
            plan_id: planId,
            step_index: stepIndex,
            status,
            notes
          });
          break;
        case "batch_update":
          if (!updates || updates.length === 0) {
            return this.errorResult("updates array is required for batch_update action");
          }
          result = await this.mcpBridge.callTool("memory_steps", {
            action: "batch_update",
            workspace_id: workspaceId,
            plan_id: planId,
            updates
          });
          break;
        case "add":
          if (!newSteps || newSteps.length === 0) {
            return this.errorResult("newSteps array is required for add action");
          }
          result = await this.mcpBridge.callTool("memory_steps", {
            action: "add",
            workspace_id: workspaceId,
            plan_id: planId,
            steps: newSteps.map((s) => ({
              ...s,
              status: s.status || "pending"
            }))
          });
          break;
        default:
          return this.errorResult(`Unknown action: ${action}`);
      }
      return new vscode10.LanguageModelToolResult([
        new vscode10.LanguageModelTextPart(JSON.stringify(result, null, 2))
      ]);
    } catch (error) {
      return this.errorResult(error);
    }
  }
  /**
   * Handle memory_context tool invocation
   */
  async handleContext(options, token) {
    try {
      if (!this.mcpBridge.isConnected()) {
        return this.errorResult("MCP server not connected");
      }
      const workspaceId = await this.ensureWorkspace();
      const { action, planId, note, noteType, targetAgent, reason } = options.input;
      let result;
      switch (action) {
        case "add_note":
          if (!planId || !note) {
            return this.errorResult("planId and note are required for add_note action");
          }
          result = await this.mcpBridge.callTool("memory_plan", {
            action: "add_note",
            workspace_id: workspaceId,
            plan_id: planId,
            note,
            note_type: noteType || "info"
          });
          break;
        case "briefing":
          if (!planId) {
            return this.errorResult("planId is required for briefing action");
          }
          result = await this.mcpBridge.callTool("memory_agent", {
            action: "get_briefing",
            workspace_id: workspaceId,
            plan_id: planId
          });
          break;
        case "handoff":
          if (!planId || !targetAgent || !reason) {
            return this.errorResult("planId, targetAgent, and reason are required for handoff action");
          }
          result = await this.mcpBridge.callTool("memory_agent", {
            action: "handoff",
            workspace_id: workspaceId,
            plan_id: planId,
            to_agent: targetAgent,
            reason
          });
          break;
        case "workspace":
          result = await this.mcpBridge.callTool("memory_workspace", {
            action: "info",
            workspace_id: workspaceId
          });
          break;
        default:
          return this.errorResult(`Unknown action: ${action}`);
      }
      return new vscode10.LanguageModelToolResult([
        new vscode10.LanguageModelTextPart(JSON.stringify(result, null, 2))
      ]);
    } catch (error) {
      return this.errorResult(error);
    }
  }
  /**
   * Create error result
   */
  errorResult(error) {
    const message = error instanceof Error ? error.message : String(error);
    return new vscode10.LanguageModelToolResult([
      new vscode10.LanguageModelTextPart(JSON.stringify({
        success: false,
        error: message
      }))
    ]);
  }
  /**
   * Dispose of resources
   */
  dispose() {
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }
};

// src/extension.ts
var dashboardProvider;
var agentWatcher;
var copilotFileWatcher;
var statusBarManager;
var serverManager;
var defaultDeployer;
var mcpBridge = null;
var chatParticipant = null;
var toolProvider = null;
function notify5(message, ...items) {
  const config = vscode11.workspace.getConfiguration("projectMemory");
  if (config.get("showNotifications", true)) {
    return vscode11.window.showInformationMessage(message, ...items);
  }
  return Promise.resolve(void 0);
}
function activate(context) {
  console.log("Project Memory Dashboard extension activating...");
  const config = vscode11.workspace.getConfiguration("projectMemory");
  const dataRoot = config.get("dataRoot") || getDefaultDataRoot();
  const agentsRoot = config.get("agentsRoot") || getDefaultAgentsRoot();
  const promptsRoot = config.get("promptsRoot");
  const instructionsRoot = config.get("instructionsRoot");
  const serverPort = config.get("serverPort") || 3001;
  const wsPort = config.get("wsPort") || 3002;
  const autoStartServer = config.get("autoStartServer") ?? true;
  const defaultAgents = config.get("defaultAgents") || [];
  const defaultInstructions = config.get("defaultInstructions") || [];
  const autoDeployOnWorkspaceOpen = config.get("autoDeployOnWorkspaceOpen") ?? false;
  defaultDeployer = new DefaultDeployer({
    agentsRoot,
    instructionsRoot: instructionsRoot || getDefaultInstructionsRoot(),
    defaultAgents,
    defaultInstructions
  });
  if (autoDeployOnWorkspaceOpen && vscode11.workspace.workspaceFolders?.[0]) {
    const workspacePath = vscode11.workspace.workspaceFolders[0].uri.fsPath;
    defaultDeployer.deployToWorkspace(workspacePath).then((result) => {
      if (result.agents.length > 0 || result.instructions.length > 0) {
        notify5(
          `Deployed ${result.agents.length} agents and ${result.instructions.length} instructions`
        );
      }
    });
  }
  serverManager = new ServerManager({
    dataRoot,
    agentsRoot,
    promptsRoot,
    instructionsRoot,
    serverPort,
    wsPort
  });
  context.subscriptions.push(serverManager);
  if (autoStartServer && serverManager.hasServerDirectory()) {
    serverManager.start().then(async (success) => {
      if (success) {
        if (serverManager.isExternalServer) {
          notify5("Connected to existing Project Memory server");
        } else {
          notify5("Project Memory API server started");
        }
      } else {
        vscode11.window.showWarningMessage(
          "Failed to start Project Memory server. Click to view logs.",
          "View Logs"
        ).then((selection) => {
          if (selection === "View Logs") {
            serverManager.showLogs();
          }
        });
      }
    });
  }
  initializeChatIntegration(context, config, dataRoot);
  dashboardProvider = new DashboardViewProvider(context.extensionUri, dataRoot, agentsRoot);
  context.subscriptions.push(
    vscode11.window.registerWebviewViewProvider(
      "projectMemory.dashboardView",
      dashboardProvider,
      {
        webviewOptions: {
          retainContextWhenHidden: true
        }
      }
    )
  );
  context.subscriptions.push(
    vscode11.commands.registerCommand("projectMemory.showDashboard", () => {
      vscode11.commands.executeCommand("workbench.view.extension.projectMemory");
    }),
    vscode11.commands.registerCommand("projectMemory.openDashboardPanel", async (url) => {
      if (!serverManager.isRunning) {
        const startServer = await vscode11.window.showWarningMessage(
          "Project Memory server is not running. Start it first?",
          "Start Server",
          "Cancel"
        );
        if (startServer !== "Start Server") return;
        const success = await vscode11.window.withProgress({
          location: vscode11.ProgressLocation.Notification,
          title: "Starting Project Memory server...",
          cancellable: false
        }, async () => {
          return await serverManager.start();
        });
        if (!success) {
          vscode11.window.showErrorMessage("Failed to start server. Check logs for details.");
          serverManager.showLogs();
          return;
        }
      }
      if (!serverManager.isFrontendRunning) {
        const success = await vscode11.window.withProgress({
          location: vscode11.ProgressLocation.Notification,
          title: "Starting dashboard frontend...",
          cancellable: false
        }, async () => {
          return await serverManager.startFrontend();
        });
        if (!success) {
          vscode11.window.showErrorMessage("Failed to start dashboard frontend. Check server logs.");
          serverManager.showLogs();
          return;
        }
      }
      const dashboardUrl = url || "http://localhost:5173";
      DashboardPanel.createOrShow(context.extensionUri, dashboardUrl);
    }),
    // Server management commands
    vscode11.commands.registerCommand("projectMemory.toggleServer", async () => {
      if (serverManager.isRunning) {
        await serverManager.stopFrontend();
        await serverManager.stop();
        notify5("Project Memory server stopped");
      } else {
        const success = await serverManager.start();
        if (success) {
          notify5("Project Memory server started");
        } else {
          vscode11.window.showErrorMessage("Failed to start Project Memory server");
        }
      }
    }),
    vscode11.commands.registerCommand("projectMemory.startServer", async () => {
      if (serverManager.isRunning) {
        notify5("Server is already running");
        return;
      }
      const success = await serverManager.start();
      if (success) {
        notify5("Project Memory server started");
      } else {
        vscode11.window.showErrorMessage("Failed to start server. Check logs for details.");
        serverManager.showLogs();
      }
    }),
    vscode11.commands.registerCommand("projectMemory.stopServer", async () => {
      await serverManager.stopFrontend();
      await serverManager.stop();
      notify5("Project Memory server stopped");
    }),
    vscode11.commands.registerCommand("projectMemory.restartServer", async () => {
      notify5("Restarting Project Memory server...");
      await serverManager.stopFrontend();
      const success = await serverManager.restart();
      if (success) {
        notify5("Project Memory server restarted");
      } else {
        vscode11.window.showErrorMessage("Failed to restart server");
      }
    }),
    vscode11.commands.registerCommand("projectMemory.showServerLogs", () => {
      serverManager.showLogs();
    }),
    vscode11.commands.registerCommand("projectMemory.openSettings", async () => {
      const config2 = vscode11.workspace.getConfiguration("projectMemory");
      const agentsRoot2 = config2.get("agentsRoot") || getDefaultAgentsRoot();
      const instructionsRoot2 = config2.get("instructionsRoot") || getDefaultInstructionsRoot();
      const promptsRoot2 = config2.get("promptsRoot") || getDefaultPromptsRoot();
      const choice = await vscode11.window.showQuickPick([
        { label: "$(person) Configure Default Agents", description: "Select which agents to deploy by default", value: "agents" },
        { label: "$(book) Configure Default Instructions", description: "Select which instructions to deploy by default", value: "instructions" },
        { label: "$(file) Configure Default Prompts", description: "Select which prompts to deploy by default", value: "prompts" },
        { label: "$(gear) Open All Settings", description: "Open VS Code settings for Project Memory", value: "settings" }
      ], {
        placeHolder: "What would you like to configure?"
      });
      if (!choice) return;
      const fs2 = require("fs");
      if (choice.value === "settings") {
        vscode11.commands.executeCommand("workbench.action.openSettings", "@ext:project-memory.project-memory-dashboard");
        return;
      }
      if (choice.value === "agents" && agentsRoot2) {
        try {
          const allAgentFiles = fs2.readdirSync(agentsRoot2).filter((f) => f.endsWith(".agent.md")).map((f) => f.replace(".agent.md", ""));
          const currentDefaults = config2.get("defaultAgents") || [];
          const items = allAgentFiles.map((name) => ({
            label: name,
            picked: currentDefaults.length === 0 || currentDefaults.includes(name)
          }));
          const selected = await vscode11.window.showQuickPick(items, {
            canPickMany: true,
            placeHolder: "Select default agents (these will be pre-selected when deploying)",
            title: "Configure Default Agents"
          });
          if (selected) {
            await config2.update("defaultAgents", selected.map((s) => s.label), vscode11.ConfigurationTarget.Global);
            notify5(`\u2705 Updated default agents (${selected.length} selected)`);
          }
        } catch (error) {
          vscode11.window.showErrorMessage(`Failed to read agents: ${error}`);
        }
      }
      if (choice.value === "instructions" && instructionsRoot2) {
        try {
          const allInstructionFiles = fs2.readdirSync(instructionsRoot2).filter((f) => f.endsWith(".instructions.md")).map((f) => f.replace(".instructions.md", ""));
          const currentDefaults = config2.get("defaultInstructions") || [];
          const items = allInstructionFiles.map((name) => ({
            label: name,
            picked: currentDefaults.length === 0 || currentDefaults.includes(name)
          }));
          const selected = await vscode11.window.showQuickPick(items, {
            canPickMany: true,
            placeHolder: "Select default instructions (these will be pre-selected when deploying)",
            title: "Configure Default Instructions"
          });
          if (selected) {
            await config2.update("defaultInstructions", selected.map((s) => s.label), vscode11.ConfigurationTarget.Global);
            notify5(`\u2705 Updated default instructions (${selected.length} selected)`);
          }
        } catch (error) {
          vscode11.window.showErrorMessage(`Failed to read instructions: ${error}`);
        }
      }
      if (choice.value === "prompts" && promptsRoot2) {
        try {
          const allPromptFiles = fs2.readdirSync(promptsRoot2).filter((f) => f.endsWith(".prompt.md")).map((f) => f.replace(".prompt.md", ""));
          const currentDefaults = config2.get("defaultPrompts") || [];
          const items = allPromptFiles.map((name) => ({
            label: name,
            picked: currentDefaults.length === 0 || currentDefaults.includes(name)
          }));
          const selected = await vscode11.window.showQuickPick(items, {
            canPickMany: true,
            placeHolder: "Select default prompts (these will be pre-selected when deploying)",
            title: "Configure Default Prompts"
          });
          if (selected) {
            await config2.update("defaultPrompts", selected.map((s) => s.label), vscode11.ConfigurationTarget.Global);
            notify5(`\u2705 Updated default prompts (${selected.length} selected)`);
          }
        } catch (error) {
          vscode11.window.showErrorMessage(`Failed to read prompts: ${error}`);
        }
      }
    }),
    vscode11.commands.registerCommand("projectMemory.createPlan", async () => {
      const workspaceFolders = vscode11.workspace.workspaceFolders;
      if (!workspaceFolders) {
        vscode11.window.showErrorMessage("No workspace folder open");
        return;
      }
      const approach = await vscode11.window.showQuickPick(
        [
          { label: "\u{1F9E0} Brainstorm First", description: "Explore ideas with an AI agent before creating a formal plan", value: "brainstorm" },
          { label: "\u{1F4DD} Create Plan Directly", description: "Create a formal plan with title, description, and category", value: "create" }
        ],
        { placeHolder: "How would you like to start?" }
      );
      if (!approach) return;
      if (approach.value === "brainstorm") {
        const initialPrompt = await vscode11.window.showInputBox({
          prompt: "What would you like to brainstorm?",
          placeHolder: "Describe the feature, problem, or idea you want to explore...",
          validateInput: (value) => value.trim() ? null : "Please enter a description"
        });
        if (!initialPrompt) return;
        try {
          await vscode11.commands.executeCommand("workbench.action.chat.open", {
            query: `@brainstorm ${initialPrompt}`
          });
        } catch {
          const result = await vscode11.window.showInformationMessage(
            "Open GitHub Copilot Chat and use @brainstorm agent with your prompt.",
            "Copy Prompt"
          );
          if (result === "Copy Prompt") {
            await vscode11.env.clipboard.writeText(`@brainstorm ${initialPrompt}`);
            notify5("Prompt copied to clipboard");
          }
        }
        return;
      }
      const title = await vscode11.window.showInputBox({
        prompt: "Enter plan title",
        placeHolder: "My new feature...",
        validateInput: (value) => value.trim() ? null : "Title is required"
      });
      if (!title) return;
      const description = await vscode11.window.showInputBox({
        prompt: "Enter plan description",
        placeHolder: "Describe what this plan will accomplish, the goals, and any context...",
        validateInput: (value) => value.trim().length >= 10 ? null : "Please provide at least a brief description (10+ characters)"
      });
      if (!description) return;
      const category = await vscode11.window.showQuickPick(
        [
          { label: "\u2728 Feature", description: "New functionality or capability", value: "feature" },
          { label: "\u{1F41B} Bug", description: "Fix for an existing issue", value: "bug" },
          { label: "\u{1F504} Change", description: "Modification to existing behavior", value: "change" },
          { label: "\u{1F50D} Analysis", description: "Investigation or research task", value: "analysis" },
          { label: "\u{1F41E} Debug", description: "Debugging session for an issue", value: "debug" },
          { label: "\u267B\uFE0F Refactor", description: "Code improvement without behavior change", value: "refactor" },
          { label: "\u{1F4DA} Documentation", description: "Documentation updates", value: "documentation" }
        ],
        { placeHolder: "Select plan category" }
      );
      if (!category) return;
      const priority = await vscode11.window.showQuickPick(
        [
          { label: "\u{1F534} Critical", description: "Urgent - needs immediate attention", value: "critical" },
          { label: "\u{1F7E0} High", description: "Important - should be done soon", value: "high" },
          { label: "\u{1F7E1} Medium", description: "Normal priority", value: "medium" },
          { label: "\u{1F7E2} Low", description: "Nice to have - when time permits", value: "low" }
        ],
        { placeHolder: "Select priority level" }
      );
      if (!priority) return;
      const workspacePath = workspaceFolders[0].uri.fsPath;
      const name = require("path").basename(workspacePath).toLowerCase().replace(/[^a-z0-9]/g, "_").substring(0, 20);
      const hash = require("crypto").createHash("md5").update(workspacePath).digest("hex").substring(0, 12);
      const workspaceId = `${name}-${hash}`;
      try {
        const response = await fetch(`http://localhost:${serverPort}/api/plans`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId,
            title,
            description,
            category: category.value,
            priority: priority.value
          })
        });
        if (response.ok) {
          const data = await response.json();
          notify5(`Plan created: ${title}`, "Open Dashboard").then((selection) => {
            if (selection === "Open Dashboard") {
              vscode11.commands.executeCommand(
                "projectMemory.openDashboardPanel",
                `http://localhost:5173/workspace/${workspaceId}/plan/${data.planId}`
              );
            }
          });
        } else {
          const error = await response.text();
          vscode11.window.showErrorMessage(`Failed to create plan: ${error}`);
        }
      } catch (error) {
        vscode11.window.showErrorMessage(`Failed to create plan: ${error}`);
      }
    }),
    vscode11.commands.registerCommand("projectMemory.deployAgents", async () => {
      const workspaceFolders = vscode11.workspace.workspaceFolders;
      if (!workspaceFolders) {
        vscode11.window.showErrorMessage("No workspace folder open");
        return;
      }
      const config2 = vscode11.workspace.getConfiguration("projectMemory");
      const agentsRoot2 = config2.get("agentsRoot") || getDefaultAgentsRoot();
      const defaultAgents2 = config2.get("defaultAgents") || [];
      if (!agentsRoot2) {
        vscode11.window.showErrorMessage("Agents root not configured. Set projectMemory.agentsRoot in settings.");
        return;
      }
      const workspacePath = workspaceFolders[0].uri.fsPath;
      const fs2 = require("fs");
      const path6 = require("path");
      try {
        const allAgentFiles = fs2.readdirSync(agentsRoot2).filter((f) => f.endsWith(".agent.md"));
        if (allAgentFiles.length === 0) {
          vscode11.window.showWarningMessage("No agent files found in agents root");
          return;
        }
        const items = allAgentFiles.map((f) => {
          const name = f.replace(".agent.md", "");
          return {
            label: name,
            description: f,
            picked: defaultAgents2.length === 0 || defaultAgents2.includes(name)
          };
        });
        const selectedItems = await vscode11.window.showQuickPick(items, {
          canPickMany: true,
          placeHolder: "Select agents to deploy",
          title: "Deploy Agents"
        });
        if (!selectedItems || selectedItems.length === 0) {
          return;
        }
        const targetDir = path6.join(workspacePath, ".github", "agents");
        fs2.mkdirSync(targetDir, { recursive: true });
        let copiedCount = 0;
        for (const item of selectedItems) {
          const file = `${item.label}.agent.md`;
          const sourcePath = path6.join(agentsRoot2, file);
          const targetPath = path6.join(targetDir, file);
          fs2.copyFileSync(sourcePath, targetPath);
          copiedCount++;
        }
        dashboardProvider.postMessage({
          type: "deploymentComplete",
          data: {
            type: "agents",
            count: copiedCount,
            targetDir
          }
        });
        notify5(
          `\u2705 Deployed ${copiedCount} agent(s) to ${path6.relative(workspacePath, targetDir)}`,
          "Open Folder"
        ).then((selection) => {
          if (selection === "Open Folder") {
            vscode11.commands.executeCommand("revealInExplorer", vscode11.Uri.file(targetDir));
          }
        });
      } catch (error) {
        vscode11.window.showErrorMessage(`Failed to deploy agents: ${error}`);
      }
    }),
    vscode11.commands.registerCommand("projectMemory.deployPrompts", async () => {
      const workspaceFolders = vscode11.workspace.workspaceFolders;
      if (!workspaceFolders) {
        vscode11.window.showErrorMessage("No workspace folder open");
        return;
      }
      const config2 = vscode11.workspace.getConfiguration("projectMemory");
      const promptsRoot2 = config2.get("promptsRoot") || getDefaultPromptsRoot();
      const defaultPrompts = config2.get("defaultPrompts") || [];
      if (!promptsRoot2) {
        vscode11.window.showErrorMessage("Prompts root not configured. Set projectMemory.promptsRoot in settings.");
        return;
      }
      const workspacePath = workspaceFolders[0].uri.fsPath;
      const fs2 = require("fs");
      const path6 = require("path");
      try {
        const allPromptFiles = fs2.readdirSync(promptsRoot2).filter((f) => f.endsWith(".prompt.md"));
        if (allPromptFiles.length === 0) {
          vscode11.window.showWarningMessage("No prompt files found in prompts root");
          return;
        }
        const items = allPromptFiles.map((f) => {
          const name = f.replace(".prompt.md", "");
          return {
            label: name,
            description: f,
            picked: defaultPrompts.length === 0 || defaultPrompts.includes(name)
          };
        });
        const selectedItems = await vscode11.window.showQuickPick(items, {
          canPickMany: true,
          placeHolder: "Select prompts to deploy",
          title: "Deploy Prompts"
        });
        if (!selectedItems || selectedItems.length === 0) {
          return;
        }
        const targetDir = path6.join(workspacePath, ".github", "prompts");
        fs2.mkdirSync(targetDir, { recursive: true });
        let copiedCount = 0;
        for (const item of selectedItems) {
          const file = `${item.label}.prompt.md`;
          const sourcePath = path6.join(promptsRoot2, file);
          const targetPath = path6.join(targetDir, file);
          fs2.copyFileSync(sourcePath, targetPath);
          copiedCount++;
        }
        dashboardProvider.postMessage({
          type: "deploymentComplete",
          data: {
            type: "prompts",
            count: copiedCount,
            targetDir
          }
        });
        notify5(
          `\u2705 Deployed ${copiedCount} prompt(s) to ${path6.relative(workspacePath, targetDir)}`,
          "Open Folder"
        ).then((selection) => {
          if (selection === "Open Folder") {
            vscode11.commands.executeCommand("revealInExplorer", vscode11.Uri.file(targetDir));
          }
        });
      } catch (error) {
        vscode11.window.showErrorMessage(`Failed to deploy prompts: ${error}`);
      }
    }),
    vscode11.commands.registerCommand("projectMemory.deployInstructions", async () => {
      const workspaceFolders = vscode11.workspace.workspaceFolders;
      if (!workspaceFolders) {
        vscode11.window.showErrorMessage("No workspace folder open");
        return;
      }
      const config2 = vscode11.workspace.getConfiguration("projectMemory");
      const instructionsRoot2 = config2.get("instructionsRoot") || getDefaultInstructionsRoot();
      const defaultInstructions2 = config2.get("defaultInstructions") || [];
      if (!instructionsRoot2) {
        vscode11.window.showErrorMessage("Instructions root not configured. Set projectMemory.instructionsRoot in settings.");
        return;
      }
      const workspacePath = workspaceFolders[0].uri.fsPath;
      const fs2 = require("fs");
      const path6 = require("path");
      try {
        const allInstructionFiles = fs2.readdirSync(instructionsRoot2).filter((f) => f.endsWith(".instructions.md"));
        if (allInstructionFiles.length === 0) {
          vscode11.window.showWarningMessage("No instruction files found in instructions root");
          return;
        }
        const items = allInstructionFiles.map((f) => {
          const name = f.replace(".instructions.md", "");
          return {
            label: name,
            description: f,
            picked: defaultInstructions2.length === 0 || defaultInstructions2.includes(name)
          };
        });
        const selectedItems = await vscode11.window.showQuickPick(items, {
          canPickMany: true,
          placeHolder: "Select instructions to deploy",
          title: "Deploy Instructions"
        });
        if (!selectedItems || selectedItems.length === 0) {
          return;
        }
        const targetDir = path6.join(workspacePath, ".github", "instructions");
        fs2.mkdirSync(targetDir, { recursive: true });
        let copiedCount = 0;
        for (const item of selectedItems) {
          const file = `${item.label}.instructions.md`;
          const sourcePath = path6.join(instructionsRoot2, file);
          const targetPath = path6.join(targetDir, file);
          fs2.copyFileSync(sourcePath, targetPath);
          copiedCount++;
        }
        dashboardProvider.postMessage({
          type: "deploymentComplete",
          data: {
            type: "instructions",
            count: copiedCount,
            targetDir
          }
        });
        notify5(
          `\u2705 Deployed ${copiedCount} instruction(s) to ${path6.relative(workspacePath, targetDir)}`,
          "Open Folder"
        ).then((selection) => {
          if (selection === "Open Folder") {
            vscode11.commands.executeCommand("revealInExplorer", vscode11.Uri.file(targetDir));
          }
        });
      } catch (error) {
        vscode11.window.showErrorMessage(`Failed to deploy instructions: ${error}`);
      }
    }),
    vscode11.commands.registerCommand("projectMemory.deployCopilotConfig", async () => {
      const workspaceFolders = vscode11.workspace.workspaceFolders;
      if (!workspaceFolders) {
        vscode11.window.showErrorMessage("No workspace folder open");
        return;
      }
      const confirm = await vscode11.window.showQuickPick(["Yes", "No"], {
        placeHolder: "Deploy all Copilot config (agents, prompts, instructions)?"
      });
      if (confirm === "Yes") {
        dashboardProvider.postMessage({
          type: "deployAllCopilotConfig",
          data: { workspacePath: workspaceFolders[0].uri.fsPath }
        });
        notify5("Deploying all Copilot configuration...");
      }
    }),
    vscode11.commands.registerCommand("projectMemory.deployDefaults", async () => {
      const workspaceFolders = vscode11.workspace.workspaceFolders;
      if (!workspaceFolders) {
        vscode11.window.showErrorMessage("No workspace folder open");
        return;
      }
      const plan = defaultDeployer.getDeploymentPlan();
      const confirm = await vscode11.window.showQuickPick(["Yes", "No"], {
        placeHolder: `Deploy ${plan.agents.length} agents and ${plan.instructions.length} instructions?`
      });
      if (confirm === "Yes") {
        const result = await defaultDeployer.deployToWorkspace(workspaceFolders[0].uri.fsPath);
        notify5(
          `Deployed ${result.agents.length} agents and ${result.instructions.length} instructions`
        );
      }
    }),
    vscode11.commands.registerCommand("projectMemory.updateDefaults", async () => {
      const workspaceFolders = vscode11.workspace.workspaceFolders;
      if (!workspaceFolders) {
        vscode11.window.showErrorMessage("No workspace folder open");
        return;
      }
      const result = await defaultDeployer.updateWorkspace(workspaceFolders[0].uri.fsPath);
      if (result.updated.length > 0 || result.added.length > 0) {
        notify5(
          `Updated ${result.updated.length} files, added ${result.added.length} new files`
        );
      } else {
        notify5("All files are up to date");
      }
    }),
    vscode11.commands.registerCommand("projectMemory.openAgentFile", async () => {
      const config2 = vscode11.workspace.getConfiguration("projectMemory");
      const agentsRoot2 = config2.get("agentsRoot") || getDefaultAgentsRoot();
      if (!agentsRoot2) {
        vscode11.window.showErrorMessage("Agents root not configured");
        return;
      }
      const fs2 = require("fs");
      const path6 = require("path");
      try {
        const files = fs2.readdirSync(agentsRoot2).filter((f) => f.endsWith(".agent.md"));
        const selected = await vscode11.window.showQuickPick(files, {
          placeHolder: "Select an agent file to open"
        });
        if (selected) {
          const filePath = path6.join(agentsRoot2, selected);
          const doc = await vscode11.workspace.openTextDocument(filePath);
          await vscode11.window.showTextDocument(doc);
        }
      } catch (error) {
        vscode11.window.showErrorMessage(`Failed to list agent files: ${error}`);
      }
    }),
    vscode11.commands.registerCommand("projectMemory.openPromptFile", async () => {
      const config2 = vscode11.workspace.getConfiguration("projectMemory");
      const promptsRoot2 = config2.get("promptsRoot");
      if (!promptsRoot2) {
        vscode11.window.showErrorMessage("Prompts root not configured. Set projectMemory.promptsRoot in settings.");
        return;
      }
      const fs2 = require("fs");
      const path6 = require("path");
      try {
        const files = fs2.readdirSync(promptsRoot2).filter((f) => f.endsWith(".prompt.md"));
        const selected = await vscode11.window.showQuickPick(files, {
          placeHolder: "Select a prompt file to open"
        });
        if (selected) {
          const filePath = path6.join(promptsRoot2, selected);
          const doc = await vscode11.workspace.openTextDocument(filePath);
          await vscode11.window.showTextDocument(doc);
        }
      } catch (error) {
        vscode11.window.showErrorMessage(`Failed to list prompt files: ${error}`);
      }
    }),
    vscode11.commands.registerCommand("projectMemory.showCopilotStatus", () => {
      dashboardProvider.postMessage({ type: "showCopilotStatus" });
      vscode11.commands.executeCommand("workbench.view.extension.projectMemory");
    }),
    vscode11.commands.registerCommand("projectMemory.refreshData", () => {
      dashboardProvider.postMessage({ type: "refresh" });
    }),
    vscode11.commands.registerCommand("projectMemory.openFile", async (filePath, line) => {
      try {
        const document = await vscode11.workspace.openTextDocument(filePath);
        const editor = await vscode11.window.showTextDocument(document);
        if (line !== void 0) {
          const position = new vscode11.Position(line - 1, 0);
          editor.selection = new vscode11.Selection(position, position);
          editor.revealRange(new vscode11.Range(position, position), vscode11.TextEditorRevealType.InCenter);
        }
      } catch (error) {
        vscode11.window.showErrorMessage(`Failed to open file: ${filePath}`);
      }
    }),
    // Add to Plan command - context menu for files
    vscode11.commands.registerCommand("projectMemory.addToPlan", async (uri) => {
      let filePath;
      let selectedText;
      let lineNumber;
      if (uri) {
        filePath = uri.fsPath;
      } else {
        const editor = vscode11.window.activeTextEditor;
        if (editor) {
          filePath = editor.document.uri.fsPath;
          const selection = editor.selection;
          if (!selection.isEmpty) {
            selectedText = editor.document.getText(selection);
            lineNumber = selection.start.line + 1;
          }
        }
      }
      if (!filePath) {
        vscode11.window.showErrorMessage("No file selected");
        return;
      }
      const workspaceFolders = vscode11.workspace.workspaceFolders;
      if (!workspaceFolders) {
        vscode11.window.showErrorMessage("No workspace folder open");
        return;
      }
      const stepTask = await vscode11.window.showInputBox({
        prompt: "Describe the step/task for this file",
        placeHolder: "e.g., Review and update authentication logic",
        value: selectedText ? `Review: ${selectedText.substring(0, 50)}...` : `Work on ${require("path").basename(filePath)}`
      });
      if (!stepTask) {
        return;
      }
      const phase = await vscode11.window.showQuickPick(
        ["implementation", "review", "testing", "documentation", "refactor", "bugfix"],
        { placeHolder: "Select the phase for this step" }
      );
      if (!phase) {
        return;
      }
      dashboardProvider.postMessage({
        type: "addStepToPlan",
        data: {
          task: stepTask,
          phase,
          file: filePath,
          line: lineNumber,
          notes: selectedText ? `Selected code:
\`\`\`
${selectedText.substring(0, 500)}
\`\`\`` : void 0
        }
      });
      notify5(`Added step to plan: "${stepTask}"`);
    })
  );
  if (agentsRoot) {
    agentWatcher = new AgentWatcher(agentsRoot, config.get("autoDeployAgents") || false);
    agentWatcher.start();
    context.subscriptions.push({
      dispose: () => agentWatcher.stop()
    });
  }
  copilotFileWatcher = new CopilotFileWatcher({
    agentsRoot,
    promptsRoot,
    instructionsRoot,
    autoDeploy: config.get("autoDeployAgents") || false
  });
  copilotFileWatcher.start();
  copilotFileWatcher.onFileChanged((type, filePath, action) => {
    if (action === "change") {
      statusBarManager.showTemporaryMessage(`${type} updated`);
    }
  });
  context.subscriptions.push({
    dispose: () => copilotFileWatcher.stop()
  });
  statusBarManager = new StatusBarManager();
  context.subscriptions.push(statusBarManager);
  context.subscriptions.push(
    vscode11.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("projectMemory")) {
        const newConfig = vscode11.workspace.getConfiguration("projectMemory");
        dashboardProvider.updateConfig(
          newConfig.get("dataRoot") || getDefaultDataRoot(),
          newConfig.get("agentsRoot") || getDefaultAgentsRoot()
        );
      }
    })
  );
  console.log("Project Memory Dashboard extension activated");
}
async function deactivate() {
  console.log("Project Memory Dashboard extension deactivating...");
  if (mcpBridge) {
    await mcpBridge.disconnect();
    mcpBridge.dispose();
    mcpBridge = null;
  }
  if (chatParticipant) {
    chatParticipant.dispose();
    chatParticipant = null;
  }
  if (toolProvider) {
    toolProvider.dispose();
    toolProvider = null;
  }
  if (dashboardProvider) {
    dashboardProvider.dispose();
  }
  if (agentWatcher) {
    agentWatcher.stop();
  }
  if (copilotFileWatcher) {
    copilotFileWatcher.stop();
  }
  if (serverManager) {
    await serverManager.stopFrontend();
    await serverManager.stop();
  }
  console.log("Project Memory Dashboard extension deactivated");
}
function getDefaultDataRoot() {
  const workspaceFolders = vscode11.workspace.workspaceFolders;
  if (workspaceFolders) {
    return vscode11.Uri.joinPath(workspaceFolders[0].uri, "data").fsPath;
  }
  return "";
}
function getDefaultAgentsRoot() {
  const workspaceFolders = vscode11.workspace.workspaceFolders;
  if (workspaceFolders) {
    return vscode11.Uri.joinPath(workspaceFolders[0].uri, "agents").fsPath;
  }
  return "";
}
function getDefaultInstructionsRoot() {
  const workspaceFolders = vscode11.workspace.workspaceFolders;
  if (workspaceFolders) {
    return vscode11.Uri.joinPath(workspaceFolders[0].uri, "instructions").fsPath;
  }
  return "";
}
function getDefaultPromptsRoot() {
  const workspaceFolders = vscode11.workspace.workspaceFolders;
  if (workspaceFolders) {
    return vscode11.Uri.joinPath(workspaceFolders[0].uri, "prompts").fsPath;
  }
  return "";
}
function initializeChatIntegration(context, config, dataRoot) {
  const serverMode = config.get("chat.serverMode") || "bundled";
  const podmanImage = config.get("chat.podmanImage") || "project-memory-mcp:latest";
  const externalServerPath = config.get("chat.externalServerPath") || "";
  const autoConnect = config.get("chat.autoConnect") ?? true;
  mcpBridge = new McpBridge({
    serverMode,
    podmanImage,
    externalServerPath,
    dataRoot
  });
  context.subscriptions.push(mcpBridge);
  mcpBridge.onConnectionChange((connected) => {
    if (connected) {
      chatParticipant?.resetWorkspace();
      toolProvider?.resetWorkspace();
    }
  });
  chatParticipant = new ChatParticipant(mcpBridge);
  context.subscriptions.push(chatParticipant);
  toolProvider = new ToolProvider(mcpBridge);
  context.subscriptions.push(toolProvider);
  context.subscriptions.push(
    vscode11.commands.registerCommand("projectMemory.chat.reconnect", async () => {
      if (!mcpBridge) {
        vscode11.window.showErrorMessage("MCP Bridge not initialized");
        return;
      }
      try {
        await vscode11.window.withProgress({
          location: vscode11.ProgressLocation.Notification,
          title: "Reconnecting to MCP server...",
          cancellable: false
        }, async () => {
          await mcpBridge.reconnect();
        });
        notify5("Connected to MCP server");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode11.window.showErrorMessage(`Failed to connect: ${message}`);
        mcpBridge.showLogs();
      }
    })
  );
  if (autoConnect) {
    mcpBridge.connect().then(() => {
      console.log("MCP Bridge connected");
    }).catch((error) => {
      console.warn("MCP Bridge auto-connect failed:", error);
    });
  }
  context.subscriptions.push(
    vscode11.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("projectMemory.chat")) {
        notify5(
          "Chat configuration changed. Some changes may require reconnecting.",
          "Reconnect"
        ).then((selection) => {
          if (selection === "Reconnect") {
            vscode11.commands.executeCommand("projectMemory.chat.reconnect");
          }
        });
      }
    })
  );
  context.subscriptions.push(
    vscode11.workspace.onDidChangeWorkspaceFolders(() => {
      chatParticipant?.resetWorkspace();
      toolProvider?.resetWorkspace();
    })
  );
  console.log("Chat integration initialized");
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
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
//# sourceMappingURL=extension.js.map
