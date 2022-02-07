#!/usr/bin/env node
/*jslint es5: true */

const swig = require('../index')
const yargs = require('yargs/yargs')
const fs = require('fs')
const path = require('path')
const filters = require('../lib/filters')
const utils = require('../lib/utils')
const uglify = require('uglify-js')

let wrapstart = 'var tpl = '

const argv = yargs(process.argv.slice(2))
    .usage('\n Usage:\n' +
      '    $0 compile [files] [options]\n' +
      '    $0 run [files] [options]\n' +
      '    $0 render [files] [options]\n'
      )
    .command('compile', 'compile swig')
    .command('run', 'run swig')
    .command('render', 'render swig')
    .describe('v', 'Show the Swig version number.')
    .describe('o', 'Output location.')
    .describe('h', 'Show this help screen.')
    .describe('j', 'Variable context as a JSON file.')
    .describe('c', 'Variable context as a CommonJS-style file. Used only if option `j` is not provided.')
    .describe('m', 'Minify compiled functions with uglify-js')
    .describe('filters', 'Custom filters as a CommonJS-style file')
    .describe('tags', 'Custom tags as a CommonJS-style file')
    .describe('options', 'Customize Swig\'s Options from a CommonJS-style file')
    .describe('wrap-start', 'Template wrapper beginning for "compile".')
    .describe('wrap-end', 'Template wrapper end for "compile".')
    .describe('method-name', 'Method name to set template to and run from.')
    .alias('v', 'version')
    .alias('o', 'output')
    .default('o', 'stdout')
    .alias('h', 'help')
    .alias('j', 'json')
    .alias('c', 'context')
    .alias('m', 'minify')
    .default('wrap-start', wrapstart)
    .default('wrap-end', ';')
    .default('method-name', 'tpl')
    .demand(1, 'must provide a valid command')
    .argv
let ctx = {}
let out = function (file, str) {
  console.log(str)
}
let efn = function () {}
let fn
let command = argv._[0]

// What version?
if (argv.v) {
  console.log(require('../package').version);
  process.exit(0);
}

if (argv['method-name'] !== 'tpl' && argv['wrap-start'] !== wrapstart) {
  throw new Error('Cannot use arguments "--method-name" and "--wrap-start" together.');
}

if (argv['method-name'] !== 'tpl') {
  argv['wrap-start'] = 'var ' + argv['method-name'] + ' = ';
}

// Pull in any context data provided
if (argv.j) {
  ctx = JSON.parse(fs.readFileSync(argv.j, 'utf8'));
} else if (argv.c) {
  ctx = require(argv.c);
}

if (argv.o !== 'stdout') {
  argv.o += '/';
  argv.o = path.normalize(argv.o);

  try {
    fs.mkdirSync(argv.o);
  } catch (e) {
    if (e.errno !== 47) {
      throw e;
    }
  }

  out = function (file, str) {
    file = path.basename(file);
    fs.writeFileSync(argv.o + file, str, { flags: 'w' });
    console.log('Wrote', argv.o + file);
  };
}

// Set any custom filters
if (argv.filters) {
  utils.each(require(path.resolve(argv.filters)), function (filter, name) {
    swig.setFilter(name, filter);
  });
}

// Set any custom tags
if (argv.tags) {
  utils.each(require(path.resolve(argv.tags)), function (tag, name) {
    swig.setTag(name, tag.parse, tag.compile, tag.ends, tag.block);
  });
}

// Specify swig default options
if (argv.options) {
  swig.setDefaults(require(argv.options));
}

switch (command) {
case 'compile':
  fn = function (file, str) {
    var r = swig.precompile(str, { filename: file, locals: ctx }).tpl.toString().replace('anonymous', '');

    r = argv['wrap-start'] + r + argv['wrap-end'];

    if (argv.m) {
      r = uglify.minify(r).code;
    }

    out(file, r);
  };
  break;

case 'run':
  fn = function (file, str) {
    (function () {
      eval(str);
      var __tpl = eval(argv['method-name']);
      out(file, __tpl(swig, ctx, filters, utils, efn));
    }());
  };
  break;

case 'render':
  fn = function (file, str) {
    out(file, swig.render(str, { filename: file, locals: ctx }));
  };
  break;
}

argv._.slice(1).forEach(function (file) {
  var str = fs.readFileSync(file, 'utf8');
  fn(file, str);
});
