var fs = require('fs')
var RSVP = require('rsvp')
var quickTemp = require('quick-temp')
var mapSeries = require('promise-map-series')
var rimraf = require('rimraf')


// Wrap a new-style plugin to provide the .read API

exports.NewStyleTreeWrapper = NewStyleTreeWrapper
function NewStyleTreeWrapper (newStyleTree) {
  this.newStyleTree = newStyleTree
  this.description = newStyleTree.description ||
    (newStyleTree.constructor && newStyleTree.constructor.name) ||
    'NewStyleTreeWrapper'

  // Wrap string trees so we can set .directory on them
  if (typeof newStyleTree.inputTree === 'string') {
    newStyleTree.inputTree = new StringTreeWrapper(newStyleTree.inputTree)
  }
  for (var i = 0; i < (newStyleTree.inputTrees || []).length; i++) {
    if (typeof newStyleTree.inputTrees[i] === 'string') {
      newStyleTree.inputTrees[i] = new StringTreeWrapper(newStyleTree.inputTrees[i])
    }
  }
}

NewStyleTreeWrapper.prototype.read = function (readTree) {
  var tree = this.newStyleTree

  quickTemp.makeOrReuse(tree, 'cache')
  quickTemp.makeOrReuse(tree, 'directory') // reuse to keep name across rebuilds
  rimraf.sync(tree.directory)
  fs.mkdirSync(tree.directory)

  if (!tree.inputTrees && !tree.inputTree) {
    throw new Error('No inputTree/inputTrees set on tree: ' + tree.constructor.name)
  }
  if (tree.inputTree && tree.inputTrees) {
    throw new Error('Cannot have both inputTree and inputTrees: ' + tree.constructor.name)
  }

  var inputTrees = tree.inputTrees || [tree.inputTree]
  return mapSeries(inputTrees, readTree)
    .then(function (inputPaths) {
      // Set .directory on each inputTree so rebuild() can read it
      for (var i = 0; i < inputPaths.length; i++) {
        if (typeof inputTrees[i] === 'string') {
          throw new Error('Assertion error - string tree should have been wrapped: "' + inputTrees[i] + '"')
        }
        inputTrees[i].directory = inputPaths[i]
      }
      return RSVP.resolve().then(function () {
        return tree.rebuild()
      }).then(function () {
        return tree.directory
      })
    })
}

NewStyleTreeWrapper.prototype.cleanup = function () {
  quickTemp.remove(this.newStyleTree, 'cache')
  if (this.newStyleTree.cleanup) {
    return this.newStyleTree.cleanup()
  }
}

NewStyleTreeWrapper.suppressDeprecationWarning = true


// Wrap a string tree to provide the .read API

exports.StringTreeWrapper = StringTreeWrapper
function StringTreeWrapper (stringTree) {
  this.stringTree = stringTree
  this.description = stringTree + ' (compatibility wrapper)'
  console.warn('[API Update] String trees are deprecated: "' + stringTree + '"')
}

StringTreeWrapper.prototype.read = function (readTree) {
  return readTree(this.stringTree)
}

StringTreeWrapper.prototype.cleanup = function () { }

StringTreeWrapper.prototype.suppressDeprecationWarning = true


// Wrap a .sourceDirectory tree to provide the .read API

exports.SourceTreeWrapper = SourceTreeWrapper
function SourceTreeWrapper (sourceTree) {
  this.sourceTree = sourceTree
  this.description = sourceTree.description || sourceTree.sourceDirectory + ' (compatibility wrapper)'
}

SourceTreeWrapper.prototype.read = function (readTree) {
  if (this.sourceTree.watched) {
    return readTree(this.sourceTree.sourceDirectory)
  } else {
    return this.sourceTree.sourceDirectory
  }
}

SourceTreeWrapper.prototype.cleanup = function () { }

SourceTreeWrapper.prototype.suppressDeprecationWarning = true
