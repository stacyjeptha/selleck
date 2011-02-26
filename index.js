/*
Selleck
Copyright (c) 2011 Yahoo! Inc.
Licensed under the BSD License.
*/

var fs        = require('fs'),
    path      = require('path'),
    mustache  = require('mustache'),

    fileutils = require('./lib/fileutils'),
    util      = require('./lib/util'), // Selleck's util, not Node's util.

    ComponentView = exports.ComponentView = require('./lib/view/component'),
    Higgins       = exports.Higgins       = require('./lib/higgins'),
    View          = exports.View          = require('./lib/view');

// -- Public Properties --------------------------------------------------------

/**
Path to the default theme directory.

@property defaultTheme
@type {String}
**/
exports.defaultTheme = path.join(__dirname, 'themes', 'default');

// -- Public Functions ---------------------------------------------------------

/**
@method copyAssets
@param {String} inDir
@param {String} outDir
@param {bool} [deleteFirst=false]
@callback
  @param {Error} err
**/
function copyAssets() {
    var args        = Array.prototype.slice.call(arguments),
        callback    = args.pop(),
        inDir       = args.shift(),
        outDir      = args.shift(),
        deleteFirst = args.shift(),

        inAssets  = path.join(inDir, 'assets'),
        outAssets = path.join(outDir, 'assets');

    // If the input directory contains an "assets" subdirectory, copy it to the
    // output directory.
    if (fileutils.isDirectory(inAssets)) {
        if (deleteFirst && fileutils.isDirectory(outAssets)) {
            fileutils.deletePath(outAssets);
        }

        fileutils.copyPath(inAssets, outAssets, true, callback);
    } else {
        callback();
    }
}
exports.copyAssets = copyAssets;

/**
@method createOutputDir
**/
function createOutputDir(outDir) {
    var stats = fileutils.statSync(outDir);

    if (stats) {
        if (!stats.isDirectory()) {
            throw new Error('Output path already exists and is not a directory: ' + outDir);
        }
    } else {
        // TODO: mkdir -p
        fs.mkdirSync(outDir, 0755);
    }
}
exports.createOutputDir = createOutputDir;

/**
@method findDocs
@return {Object}
**/
function findDocs(dir, docs) {
    docs || (docs = {components: []});

    if (!fileutils.isDirectory(dir)) {
        log('Not a directory: ' + dir, 'error');
        return docs;
    }

    if (isComponentDirectory(dir)) {
        docs.components.push({path: dir});
    } else if (isProjectDirectory(dir)) {
        if (docs.project) {
            log('Multiple projects found; ignoring ' + dir, 'warn');
        } else {
            docs.project = {path: dir};
        }
    } else {
        fs.readdirSync(dir).forEach(function (filename) {
            var filePath = path.join(dir, filename);

            // Skip hidden files and directories.
            if (filename.indexOf('.') === 0) { return; }

            if (fileutils.isDirectory(filePath)) {
                findDocs(filePath, docs);
            }
        });
    }

    return docs;
}
exports.findDocs = findDocs;

/**
@method generate
**/
function generate(inDir, outDir, options, callback) {
    prepare(inDir, options, function (err, options) {
        if (err) { return callback(err); }

        // Append meta.name to the output path if this is a component.
        if (options.component) {
            outDir = path.join(outDir, options.meta.name);
        }

        createOutputDir(outDir);

        copyAssets(inDir, outDir, function (err) {
            if (err) { return callback(err); }
            writePages(outDir, options, callback);
        });
    });
}
exports.generate = generate;

/**
@method getMetadata
**/
function getMetadata(dir, type) {
    var filePath = path.join(dir, type + '.json'),
        json, meta;

    if (fileutils.isFile(filePath)) {
        json = fs.readFileSync(filePath, 'utf8');

        try {
            meta = JSON.parse(json);
        } catch (ex) {
            log(filePath + ': JSON error: ' + ex.message, 'error');
        }
    }

    return meta || {};
}
exports.getMetadata = getMetadata;

/**
Like `getPages()`, but returns only the files under the `layout/` subdirectory
of the specified _dir_.

@method getLayouts
@param {String} dir Directory path.
@return {Object} Mapping of layout names to layout content.
**/
function getLayouts(dir) {
    return getPages(path.join(dir, 'layouts'));
}
exports.getLayouts = getLayouts;

/**
Loads and returns the content of the specified page file.

@method getPage
@param {String} pagePath Path to a single `.mustache` page.
@return {String|null} Page content, or `null` if not found.
**/
function getPage(pagePath) {
    if (!fileutils.isFile(pagePath)) { return null; }
    return fs.readFileSync(pagePath, 'utf8');
}
exports.getPage = getPage;

/**
Loads pages (files with a .mustache extension) in the specified directory and
returns an object containing a mapping of page names (the part of the filename)
preceding the .mustache extension) to page content.

@method getPages
@param {String} dir Directory path.
@return {Object} Mapping of page names to page content.
**/
function getPages(dir) {
    var pages = {};

    if (!fileutils.isDirectory(dir)) { return pages; }

    fs.readdirSync(dir).forEach(function (filename) {
        var filePath = path.join(dir, filename);

        if (path.extname(filename) === '.mustache' && fileutils.isFile(filePath)) {
            pages[path.basename(filename, '.mustache')] = fs.readFileSync(filePath, 'utf8');
        }
    });

    return pages;
}
exports.getPages = getPages;

/**
Like `getPages()`, but returns only the files under the `partial/` subdirectory
of the specified _dir_.

@method getPartials
@param {String} dir Directory path.
@return {Object} Mapping of partial names to partial content.
**/
function getPartials(dir) {
    return getPages(path.join(dir, 'partials'));
}
exports.getPartials = getPartials;

/**
@method isComponentDirectory
**/
function isComponentDirectory(dir) {
    var metaStats, indexStats;

    try {
        metaStats  = fs.statSync(path.join(dir, 'component.json'));
        indexStats = fs.statSync(path.join(dir, 'index.mustache'));
    } catch (ex) {
        return false;
    }

    return metaStats.isFile() && indexStats.isFile();
}
exports.isComponentDirectory = isComponentDirectory;

/**
@method isProjectDirectory
**/
function isProjectDirectory(dir) {
    var metaStats, indexStats;

    try {
        metaStats  = fs.statSync(path.join(dir, 'project.json'));
        indexStats = fs.statSync(path.join(dir, 'index.mustache'));
    } catch (ex) {
        return false;
    }

    return metaStats.isFile() && indexStats.isFile();
}
exports.isProjectDirectory = isProjectDirectory;

/**
@method log
**/
function log(message, level) {
    console.log('[' + (level || 'info') + '] ' + message);
}
exports.log = log;

/**
@method prepare
@param {String} inDir
@param {Object} options
@param {callback}
  @param {Error} err
  @param {Object} options Merged options.
**/
function prepare(inDir, options, callback) {
    var compiled = {},
        type     = options.component ? 'component' : 'project';

    if (options && options.skipLoad) {
        // Skip loading layouts, metadata, pages, and partials and assume that
        // the caller has provided them if they want them.
        options = util.merge({
            layouts  : {},
            meta     : {},
            pages    : {},
            partials : {},
            viewClass: options.component ? ComponentView : View
        }, options);
    } else {
        // Gather layouts, metadata, pages, and partials from the specified
        // input directory, then merge them into the provided options (if any).
        //
        // Gathered data will override provided data if there are conflicts, in
        // order to support a use case where global data are provided by the
        // caller and overridden by more specific component-level data gathered
        // from the input directory.
        options = util.merge({
            viewClass: options.component ? ComponentView : View
        }, options || {}, {
            layouts : getLayouts(inDir),
            meta    : getMetadata(inDir, type),
            pages   : getPages(inDir),
            partials: getPartials(inDir)
        });
    }

    // If a validator function was provided, run it.
    if (options.validator && options.validator(options, inDir) === false) {
        return callback(new Error('Validation failed.')); // TODO: get the error from the validator itself
    }

    if (!options.meta.layout) {
        options.meta.layout = options.layouts[type];
    }

    callback(null, options);
}
exports.prepare = prepare;

/**
Renders the specified template source.

@method render
@param {String} source Template source to render.
@param {Object} context Context object.
@param {Object} [partials] Partials object.
@param {callback}
  @param {Error} err
  @param {String} html Rendered HTML.
**/
function render(source, context, partials, callback) {
    var html = [];

    function buffer(line) {
        html.push(line);
    }

    // Allow callback as third param.
    if (typeof partials === 'function') {
        callback = partials;
        partials = {};
    }

    try {
        if (context.layout) {
            mustache.to_html(context.layout, context, util.merge(
                partials || {},
                {layout_content: source}
            ), buffer);
        } else {
            mustache.to_html(source, context, partials || {}, buffer);
        }
    } catch (ex) {
        return callback(ex);
    }

    callback(null, Higgins.render(html.join('\n')));
}
exports.render = render;

/**
@method writePages
**/
function writePages(outDir, options, callback) {
    var toWrite = util.size(options.pages);

    if (!toWrite) { return callback(); }

    // Render each page to HTML and write it to the output directory.
    util.each(options.pages, function (source, name) {
        var view = new options.viewClass(options.meta);

        render(source, view, options.partials, function (err, html) {
            if (err) { return callback(err); }
            fs.writeFile(path.join(outDir, name + '.html'), html, 'utf8', finish);
        });
    });

    function finish(err) {
        if (err) { return callback(err); }

        if (!(toWrite -= 1)) {
            callback();
        }
    }
}
exports.writePages = writePages;
