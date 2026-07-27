// Shared mutable state for mock control
let mockState = {
  countResult: [{ total: 2 }],
  dataResult: [],
  shouldReject: false,
};

const setMockState = (state) => {
  mockState = { ...mockState, ...state };
};

const resetMockState = () => {
  mockState = {
    countResult: [{ total: 2 }],
    dataResult: [],
    shouldReject: false,
  };
};

const buildBuilder = () => {
  const builder = {
    select: jest.fn(() => builder),
    from: jest.fn(() => builder),
    leftJoin: jest.fn(() => builder),
    innerJoin: jest.fn(() => builder),
    where: jest.fn(() => builder),
    whereBetween: jest.fn(() => builder),
    groupBy: jest.fn(() => builder),
    orderBy: jest.fn(() => builder),
    orderByRaw: jest.fn(() => builder),
    limit: jest.fn(() => builder),
    offset: jest.fn(() => builder),
    as: jest.fn(() => builder),
    countDistinct: jest.fn(() => builder),
    raw: jest.fn((x) => x),
    andOn: jest.fn(() => builder),
    then: jest.fn(function (onFulfilled, onRejected) {
      if (mockState.shouldReject) {
        return Promise.reject(new Error("DB error")).then(onFulfilled, onRejected);
      }
      return Promise.resolve(mockState.countResult).then(onFulfilled, onRejected);
    }),
  };

  // Override offset to return a thenable for the data query
  builder.offset = jest.fn(() => ({
    then: jest.fn(function (onFulfilled, onRejected) {
      if (mockState.shouldReject) {
        return Promise.reject(new Error("DB error")).then(onFulfilled, onRejected);
      }
      return Promise.resolve(mockState.dataResult).then(onFulfilled, onRejected);
    }),
  }));

  return builder;
};

const mockKnex = buildBuilder();
mockKnex.setMockState = setMockState;
mockKnex.resetMockState = resetMockState;

module.exports = mockKnex;
