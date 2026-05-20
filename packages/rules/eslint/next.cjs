module.exports = {
  extends: [
    require.resolve('./base.cjs'),
    'plugin:@next/next/recommended',
    'plugin:@next/next/core-web-vitals',
  ],
  env: {
    browser: true,
    node: true,
  },
};
