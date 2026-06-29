#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'privacy.html');
let h = fs.readFileSync(file, 'utf8');
h = h.replace(/<<<<<<< Updated upstream\r?\n([\s\S]*?)\r?\n=======\r?\n[\s\S]*?\r?\n>>>>>>> Stashed changes/g, '$1');
fs.writeFileSync(file, h, 'utf8');
console.log(h.includes('<<<<<<<') ? 'still conflict' : 'ok');
