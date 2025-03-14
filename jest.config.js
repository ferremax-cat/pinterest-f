// jest.config.js
 module.exports = {
    testEnvironment: 'jsdom',
    setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
    moduleNameMapper: {
      '^@/(.*)$': '<rootDir>/js/$1'
    },
    testMatch: ['**/__tests__/**/*.js', '**/*.test.js'],
    transform: {
      '^.+\\.js$': 'babel-jest'
    }
  };