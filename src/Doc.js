const sources = require('../sources.json');
const Fuse = require('fuse.js');
const fetch = require('node-fetch');
const DocBase = require('./DocBase');
const DocClass = require('./DocClass');
const DocTypedef = require('./DocTypedef');
const DocInterface = require('./DocInterface');
const { EmbedBuilder } = require('discord.js');
const docCache = new Map();

function dissectURL(url) {
  const parts = url.slice(34).split('/');
  return [parts[0], parts[1], parts[3].slice(0, -5)];
}

class Doc extends DocBase {
  constructor(url, docs) {
    super(docs);
    this.url = url;
    [this.project, this.repo, this.branch] = dissectURL(url);
    this.adoptAll(docs.classes, DocClass);
    this.adoptAll(docs.typedefs, DocTypedef);
    this.adoptAll(docs.interfaces, DocInterface);
    this.fuse = new Fuse(this.toFuseFormat(), {
      shouldSort: true,
      threshold: 0.5,
      location: 0,
      distance: 80,
      maxPatternLength: 32,
      minMatchCharLength: 1,
      keys: ['name', 'id'],
      id: 'id'
    });
  }

  get title() {
    return 'Hypixel API • Reborn';
  }

  get repoURL() {
    return `https://github.com/${this.project}/${this.repo}/blob/${this.branch}`;
  }

  get baseURL() {
    return 'https://hypixel-api-reborn.github.io';
  }

  get baseDocsURL() {
    if (!this.baseURL) return null;
    return `${this.baseURL}/#/docs/main/${this.branch}`;
  }

  get icon() {
    if (!this.baseURL) return null;
    return `${this.baseURL}/static/favicon.png`;
  }

  get color() {
    return 0xff8c00;
  }

  get(...terms) {
    const exclude = Array.isArray(terms[0]) ? terms.shift() : [];
    terms = terms.filter((term) => term).map((term) => term.toLowerCase());
    let elem = this.findChild(terms.shift());
    if (!elem || !terms.length) return elem || null;
    while (terms.length) {
      const term = terms.shift();
      const child = elem.findChild(term, exclude);
      if (!child) return null;
      elem = terms.length && child.typeElement ? child.typeElement : child;
    }
    return elem;
  }

  search(query, { excludePrivateElements } = {}) {
    const result = this.fuse.search(query);
    if (!result.length) return null;
    const filtered = [];
    while (0 < result.length && 10 > filtered.length) {
      const element = this.get(filtered, ...result.shift().split('#'));
      if (excludePrivateElements && 'private' === element.access) continue;
      filtered.push(element);
    }
    return filtered;
  }

  resolveEmbed(query, options = {}) {
    const element = this.get(...query.split(/\.|#/));
    if (element) return element.embed(options);
    const searchResults = this.search(query, options);
    if (!searchResults) return null;
    const embed = new EmbedBuilder(this.baseEmbed())
      .setTitle('Search results:')
      .setDescription(searchResults.map((el) => `**${el.link}**`).join('\n'));
    return embed;
  }

  toFuseFormat() {
    const parents = Array.from(this.children.values());
    const children = parents.map((parent) => Array.from(parent.children.values())).reduce((a, b) => a.concat(b));
    const formattedParents = parents.map(({ name }) => ({ id: name, name }));
    const formattedChildren = children.map(({ name, parent }) => ({ id: `${parent.name}#${name}`, name }));
    return formattedParents.concat(formattedChildren);
  }

  toJSON() {
    const json = {};
    for (const key of ['classes', 'typedefs', 'interfaces']) {
      if (!this[key]) continue;
      json[key] = this[key].map((item) => item.toJSON());
    }
    return json;
  }

  baseEmbed() {
    return new EmbedBuilder()
      .setTitle(this.title)
      .setAuthor({ name: `${this.title} (${this.branch})`, url: this.baseDocsURL })
      .setColor(this.color)
      .toJSON();
  }

  formatType(types) {
    const typestring = types
      .map((text, index) => {
        if (/<|>|\*/.test(text)) {
          return text
            .split('')
            .map((char) => `\\${char}`)
            .join('');
        }
        const typeElem = this.findChild(text.toLowerCase());
        const prependOr = 0 !== index && /\w|>/.test(types[index - 1]) && /\w/.test(text);
        return (prependOr ? '|' : '') + (typeElem ? typeElem.link : text);
      })
      .join('');
    return `**${typestring}**`;
  }

  static sources() {
    return sources;
  }

  static async fetch(sourceName = 'master', { force } = {}) {
    const url = sources[sourceName] || sourceName;
    if (!force && docCache.has(url)) return docCache.get(url);
    try {
      const data = await fetch(url).then((res) => res.json());
      const doc = new Doc(url, data);
      docCache.set(url, doc);
      return doc;
    } catch {
      throw new Error('invalid source name or URL.');
    }
  }
}

module.exports = Doc;
