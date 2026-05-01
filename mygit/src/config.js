import fs from 'fs';
import path from 'path';
import os from 'os';

// Global config lives at ~/.gitbroconfig
const GLOBAL_CONFIG = path.join(os.homedir(), '.gitbroconfig');

function parseConfig(text) {
    const config = {};
    let section = null;
    for (const raw of text.split('\n')) {
        const line = raw.trim();
        const sec = line.match(/^\[(.+)\]$/);
        if (sec) { section = sec[1]; config[section] = config[section] || {}; continue; }
        const kv = line.match(/^(\w+)\s*=\s*(.+)$/);
        if (kv && section) config[section][kv[1]] = kv[2].trim();
    }
    return config;
}

function serializeConfig(config) {
    const lines = [];
    for (const [section, kvs] of Object.entries(config)) {
        lines.push(`[${section}]`);
        for (const [k, v] of Object.entries(kvs)) lines.push(`  ${k} = ${v}`);
    }
    return lines.join('\n') + '\n';
}

function readGlobalConfig() {
    if (!fs.existsSync(GLOBAL_CONFIG)) return {};
    return parseConfig(fs.readFileSync(GLOBAL_CONFIG, 'utf8'));
}

function writeGlobalConfig(config) {
    fs.writeFileSync(GLOBAL_CONFIG, serializeConfig(config));
}

export function getConfigValue(key) {
    const [section, field] = key.split('.');
    const config = readGlobalConfig();
    return config[section]?.[field] || null;
}

export function configCmd(key, value, opts = {}) {
    // gitbro config --list
    if (opts.list) {
        const config = readGlobalConfig();
        if (!Object.keys(config).length) {
            console.log('No global config set yet.');
            return;
        }
        for (const [section, kvs] of Object.entries(config))
            for (const [k, v] of Object.entries(kvs))
                console.log(`${section}.${k}=${v}`);
        return;
    }

    if (!key) { console.error('usage: gitbro config <key> [value]'); process.exit(1); }

    const [section, field] = key.split('.');
    if (!field) { console.error('Key must be in format section.field  e.g. user.name'); process.exit(1); }

    const config = readGlobalConfig();

    // GET
    if (!value) {
        const val = config[section]?.[field];
        if (!val) { console.error(`config key '${key}' not set`); process.exit(1); }
        console.log(val);
        return;
    }

    // SET
    config[section] = config[section] || {};
    config[section][field] = value;
    writeGlobalConfig(config);
    console.log(`Set ${key} = ${value}`);
}