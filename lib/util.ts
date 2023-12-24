import * as yaml from "yaml";
import _ from "lodash";

/**
 * Simple template function using ES literials
 * 
 * @param {string} template 
 * @param {any} locals 
 * @returns function
 */
 export const template = (template: string, locals: {[key: string]: any}) => {
  const keys: string[] = [];
  const vals = [];

  for (var key in locals) {
    keys.push(key)
    vals.push(locals[key])
  }
    /* eslint-disable no-new-func */
  // @ts-ignore
  var fn = new Function(keys, 'return `' + template + '`')
  return fn.apply(locals, vals)
}

export const parseConfig = (content) => {
  var r = yaml.parse(content);
  console.log(r);

  if(Array.isArray(r) && r.length === 0) {
    throw "config is empty or unparseable"
  }
  return r;
};

export const getReviewers = (config, assignee) => {
  const matched = _.findKey(config, (_, key) => {
    return assignee.match(new RegExp(key));
  });

  if (matched) {
    return config[matched];
  }

  return [];
};