// @ts-nocheck
const Module = require('module');

const alias = '@infinite/Runtime';
const runtimeEntry = require.resolve('./index');
const marker = Symbol.for('infinite.runtimeAlias');

function registerAlias() {
	if (Module[marker]) return;

	const resolveFilename = Module._resolveFilename;

	Module._resolveFilename = function (request, parent, isMain, options) {
		if (request === alias) return runtimeEntry;

		return resolveFilename.call(this, request, parent, isMain, options);
	};

	Module[marker] = true;
}

module.exports = registerAlias;
