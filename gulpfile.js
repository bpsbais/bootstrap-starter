'use strict';

const { series, parallel, watch } = require('gulp');
const rimraf = require('rimraf');
const yaml = require('js-yaml');
const fs = require('fs');
const { src, dest } = require('gulp');
const gulpif = require('gulp-if');
const sass = require('gulp-sass')(require('sass'));
const sourcemaps = require('gulp-sourcemaps');
const postcss = require('gulp-postcss');
const autoprefixer = require('autoprefixer');
const cssnano = require('cssnano');
const concat = require('gulp-concat');
const panini = require('panini');
const browser = require('browser-sync');
const yargs = require('yargs/yargs')
const { hideBin } = require('yargs/helpers')
const changed = require('gulp-changed');
const squoosh = require('gulp-squoosh');
const webp = require('gulp-webp');

const PRODUCTION = !!(yargs(hideBin(process.argv)).argv.production)

const append_project_name = (folder_name, data) => {
  if (typeof data === 'object') {
    let result = [];
    for (var i = 0; i < data.length; i++) {
      if (data[i][0] === '!') {
        result.push('!' + folder_name + '/' + data[i].substr(1))
      } else {
        result.push(folder_name + '/' + data[i])
      }
    }
    return result;
  } else {
    if (data[0] === '!') {
      return '!' + folder_name + '/' + data.substr(1);
    } else {
      return folder_name + '/' + data;
    }
  }
}

const loadConfig = () => {
  let ymlFile = fs.readFileSync('config.yml', 'utf8');
  return yaml.load(ymlFile);
}

// Load settings from settings.yml
// const { PROJECT, PORT, UNCSS_OPTIONS, PATHS } = loadConfig();
const { PROJECT, PORT, PATHS } = loadConfig();

// Delete the "dist" folder
// This happens every time a build starts
const clean = (cb) => {
  rimraf(append_project_name(PROJECT, PATHS.dist), cb);
}

// Copy files out of the assets folder
// This task skips over the "img", "js", and "scss" folders, which are parsed separately
const copy = () => {
  return src(append_project_name(PROJECT, PATHS.assets))
    .pipe(dest(append_project_name(PROJECT, PATHS.dist) + '/assets'));
}

// Copy images to the "dist" folder
// In production, the images are compressed
// Ignored all files inside a folder starts with `_` (i.e. _PNGs)
const images = () => {
  const SOURCE = append_project_name(PROJECT, ['src/assets/img/**/*' , '!src/assets/img/**/_*/**/*']);
  const DEST = append_project_name(PROJECT, PATHS.dist) + '/assets/img';

  return src(SOURCE)
  .pipe(changed(DEST))
  .pipe(gulpif(PRODUCTION, squoosh()))
  .pipe(gulpif(PRODUCTION, webp({quality: 80}), webp()))
  .pipe(dest(DEST));
}

// images inside a folder start with `_` (i.e. _PNGs) will
// maintain their format (i.e. will not be converted into webp)
const preserve_format = () => {
  const SOURCE = append_project_name(PROJECT, 'src/assets/img/**/_*/**/*');
  const DEST = append_project_name(PROJECT, PATHS.dist) + '/assets/img';

  return src(SOURCE)
  .pipe(changed(DEST))
  .pipe(gulpif(PRODUCTION, squoosh()))
  .pipe(dest(DEST));
}


// Compile Sass into CSS
// In production, there will be no source-maps
const css = () => {
  const plugins = [
    autoprefixer(),
    cssnano({
      "preset": "default"
    })
  ];

  return src(append_project_name(PROJECT, 'src/assets/scss/app.scss'))
  .pipe(gulpif(!PRODUCTION, sourcemaps.init()))
  .pipe(sass({includePaths: PATHS.sass}).on('error', sass.logError))
  .pipe(postcss(plugins))
  .pipe(gulpif(!PRODUCTION, sourcemaps.write()))
  .pipe(dest(append_project_name(PROJECT, PATHS.dist) + '/assets/css'))
  .pipe(browser.reload({ stream: true }));
}

// process javascript files
const javascript = () => {
  return src(PATHS.entries)
  .pipe(dest(append_project_name(PROJECT, PATHS.dist) + '/assets/js'));
}

// Copy page templates into finished HTML files
const pages = () => {
  return src(append_project_name(PROJECT, 'src/pages/**/*.{html,hbs,handlebars}'))
  .pipe(panini({
    root: append_project_name(PROJECT, 'src/pages/'),
    layouts: append_project_name(PROJECT, 'src/layouts/'),
    partials: append_project_name(PROJECT, 'src/partials/'),
    data: append_project_name(PROJECT, 'src/data/'),
    helpers: append_project_name(PROJECT, 'src/helpers/')
  }))
  .pipe(dest(append_project_name(PROJECT, PATHS.dist)));
}

// Load updated HTML templates and partials into Panini
function resetPages(done) {
  panini.refresh();
  done();
}

// Start a server with BrowserSync to preview the site in
const server = (done) => {
  browser.init({
    server: append_project_name(PROJECT, PATHS.dist), port: PORT
  }, done);
}

// Reload the browser with BrowserSync
const reload = (done) => {
  browser.reload();
  done();
}

const watch_changes = () => {
  watch(append_project_name(PROJECT, 'src/pages/**/*.html'), series(pages, reload));
  watch(append_project_name(PROJECT, 'src/{layouts,partials}/**/*.html'), series(resetPages, pages, reload));
  watch(append_project_name(PROJECT, 'src/assets/scss/**/*.scss'), css);
  watch(append_project_name(PROJECT, 'src/assets/scss/**/*.sass'), css);
  watch(append_project_name(PROJECT, 'src/assets/img/**/*'), series(images, preserve_format, reload))
}

const build = series(clean, parallel(pages, javascript, images), preserve_format, css);

exports.build = build;

exports.default = series(build, server, watch_changes);
