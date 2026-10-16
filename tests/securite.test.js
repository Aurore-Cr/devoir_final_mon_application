'use strict';
const assert=require('node:assert/strict');
const proxyaddr=require('proxy-addr');
const qs=require('qs');
const lock=require('../package-lock.json');
// Les sous-réseaux IPv6 ne doivent pas faire confiance à toutes les IP IPv4.
assert.equal(proxyaddr.compile('::/1')('203.0.113.7'),false);
assert.equal(proxyaddr.compile('::ffff:10.0.0.0/8')('203.0.113.7'),false);
assert.equal(proxyaddr.compile('10.0.0.0/8')('10.1.2.3'),true);
assert.equal(proxyaddr.compile('10.0.0.0/8')('203.0.113.7'),false);
// Un champ isBuffer non exécutable ne doit pas faire planter stringify.
assert.doesNotThrow(()=>qs.stringify(JSON.parse('{"a":{"constructor":{"isBuffer":"x"}}}')));
assert.throws(()=>qs.parse('a[]=1,2,3,4',{comma:true,arrayLimit:3,throwOnLimitExceeded:true}),RangeError);
// L'outil de développement et ses dépendances vulnérables ont été retirés du lockfile.
for(const key of Object.keys(lock.packages)) {
 assert.ok(!/(?:^|\/)node_modules\/(?:nodemon|chokidar|braces|brace-expansion)$/.test(key),key);
}
assert.equal(require('../package.json').scripts.dev,'node --watch server.js');
console.log('OK sécurité : confiance IP, paramètres qs, limites de tableaux et retrait de la chaîne nodemon.');
