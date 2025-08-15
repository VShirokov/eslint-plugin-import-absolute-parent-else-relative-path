const fs = require('fs');
const path = require('path');

const pathSlash = path.sep;

function has(map, path) {
  let inner = map;
  for (let step of path.split('.')) {
    inner = inner[step];
    if (inner === undefined) {
      return false;
    }
  }
  return true;
}

function findDirWithFile(filename) {
  let dir = path.resolve(filename);

  do {
    dir = path.dirname(dir);
  } while (!fs.existsSync(path.join(dir, filename)) && dir !== pathSlash);

  if (!fs.existsSync(path.join(dir, filename))) {
    return;
  }

  return dir;
}

function getBaseUrl(baseDir) {
  let url = '';

  if (fs.existsSync(path.join(baseDir, 'tsconfig.json'))) {
    const tsconfig = JSON.parse(
      fs.readFileSync(path.join(baseDir, 'tsconfig.json'))
    );
    if (has(tsconfig, 'compilerOptions.baseUrl')) {
      url = tsconfig.compilerOptions.baseUrl;
    }
  } else if (fs.existsSync(path.join(baseDir, 'jsconfig.json'))) {
    const jsconfig = JSON.parse(
      fs.readFileSync(path.join(baseDir, 'jsconfig.json'))
    );
    if (has(jsconfig, 'compilerOptions.baseUrl')) {
      url = jsconfig.compilerOptions.baseUrl;
    }
  }

  return path.join(baseDir, url);
}

exports.rules = {
  'import-absolute-parent-else-relative-path': {
    meta: {
      fixable: true,
    },
    create: function (context) {
      const baseDir = findDirWithFile('package.json');
      const baseUrl = getBaseUrl(baseDir);

      return {
        ImportDeclaration(node) {
          const source = node.source.value;
          const currentPathFilename = context.getFilename();

          /**
           * Since the path is calculated together with the import file, path.relative always gives the result '../',
           * although in fact it does not go anywhere from the folder.
           * Therefore it is necessary to cut out the context file (the file from which we are looking for import paths) from the path.
           * @type {string}
           */
          const pathWithoutSelfName = currentPathFilename.substring(0, currentPathFilename.lastIndexOf(pathSlash))
          // check exist in node_modules
          const isLibrary = fs.existsSync(path.join(path.join(baseDir, 'node_modules'), source))
          const relativePath = path.relative(pathWithoutSelfName, path.join(baseUrl, source));

          if (!isLibrary && relativePath && !relativePath.startsWith('..') && !source.startsWith(`.${pathSlash}`) && relativePath !== source) {
            context.report({
              node,
              message: `Absolute path for child imports are not allowed. Use \`./${relativePath}\` instead of \`${source}\`.`,
              fix: function (fixer) {
                return fixer.replaceText(node.source, `'./${relativePath.split(pathSlash).join('/')}'`);
              },
            });
            return;
          }

          const globalAbsolutePath = path.normalize(
            path.join(path.dirname(currentPathFilename), source)
          );
          const expectedPath = path.relative(baseUrl, globalAbsolutePath).split(pathSlash).join('/');
          if (source.startsWith('..') && source !== expectedPath) {
            context.report({
              node,
              message: `Parent relative imports are not allowed. Use \`${expectedPath}\` instead of \`${source}\`.`,
              fix: function (fixer) {
                return fixer.replaceText(node.source, `'${expectedPath}'`);
              },
            });
          }
        },
      };
    },
  },
};
