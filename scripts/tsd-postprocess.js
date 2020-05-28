// Postprocess generated type definitions to introduce correctly typed tuples.
// While TypesSript compiler might be a tool-of-choice for this task, 
// we've indeed decided to let UnionReplacer show off its power.

const fs = require('fs');
const path = require('path');
const UnionReplacer = require('../dist/union-replacer.cjs');
const pkg = require('../package.json');

const TUPLE_ARRAY_TYPE_RE = /^([ \t]*(?:declare\s+)?type\s+ReplaceWith\w+\s*=\s*)\(([^;\r\n]*)\)\[\];/gm;
const OP_BRACKETS = ['[', '{', '<', '('];
const CL_BRACKETS = [']', '}', '>', ')'];
const BRACKET_MAP = CL_BRACKETS.reduce((map, bracket, index) => {
  map[bracket] = OP_BRACKETS[index];
  return map;
}, {});
const [OP_BRACKETS_RE, CL_BRACKETS_RE] = [OP_BRACKETS, CL_BRACKETS].map((list) =>
  new RegExp(`[${list.map((br) => `\\${br}`).join('')}]`)
);
const unionToListReplacer = new UnionReplacer([
  [/=>/, '$&'],
  [OP_BRACKETS_RE, function(m) { this.open(m); return m; }],
  [CL_BRACKETS_RE, function(m) { this.close(m); return m; }],
  [/\s*\|\s*/, function (m) { return this.atRoot() ? ', ' : m; }]
]);

class UnionToListConverter {
  constructor() {
    this.nestLevels = {};
  }

  open(bracket) {
    this.nestLevels[bracket] += 1;
  }

  close(bracket) {
    this.nestLevels[BRACKET_MAP[bracket]] -= 1;
  }

  atRoot() {
    return Object.values(this.nestLevels).every(count => count === 0)
  }

  convert(unionTypeDef) {
    OP_BRACKETS.forEach((bracket) => { this.nestLevels[bracket] = 0; });
    return unionToListReplacer.replace(unionTypeDef, this);
  }
}

const origFileName = `types/${pkg.name}.d.ts`;
const tsd = fs.readFileSync(origFileName, 'utf8');
const unionToListConverter = new UnionToListConverter();
const converted = tsd.replace(TUPLE_ARRAY_TYPE_RE, (m, declare, unionTypeDef) => {
  const typeList = unionToListConverter.convert(unionTypeDef);  
  if (!unionToListConverter.atRoot()) {
    throw new Error(`Unbalanced brackets in union type definition '${unionTypeDef}'`);
  }
  return `${declare}[${typeList}];`;
});

const intro = [
  `// Type definitions for ${pkg.name} ${pkg.version}`,
  `// File generated by tsd-jsdoc and ${path.relative(process.cwd(), __filename)}.`,
  '// Do not modify directly.',
  '',
  `export = ${UnionReplacer.name};`,
  `export as namespace ${UnionReplacer.name};`,
];
const output = `${intro.join('\n')}\n\n${converted}`;
fs.writeFileSync('types/index.d.ts', output, 'utf8');
fs.unlinkSync(origFileName);
