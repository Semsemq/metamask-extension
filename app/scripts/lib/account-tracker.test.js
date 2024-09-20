import EventEmitter from 'events';
import { ControllerMessenger } from '@metamask/base-controller';

import { flushPromises } from '../../../test/lib/timer-helpers';
import { createTestProviderTools } from '../../../test/stub/provider';
import AccountTracker from './account-tracker';

const noop = () => true;
const currentNetworkId = '5';
const currentChainId = '0x5';
const VALID_ADDRESS = '0x0000000000000000000000000000000000000000';
const VALID_ADDRESS_TWO = '0x0000000000000000000000000000000000000001';

const SELECTED_ADDRESS = '0x123';

const INITIAL_BALANCE_1 = '0x1';
const INITIAL_BALANCE_2 = '0x2';
const UPDATE_BALANCE = '0xabc';
const UPDATE_BALANCE_HOOK = '0xabcd';

const GAS_LIMIT = '0x111111';
const GAS_LIMIT_HOOK = '0x222222';

// The below three values were generated by running MetaMask in the browser
// The response to eth_call, which is called via `ethContract.balances`
// in `_updateAccountsViaBalanceChecker` of account-tracker.js, needs to be properly
// formatted or else ethers will throw an error.
const ETHERS_CONTRACT_BALANCES_ETH_CALL_RETURN =
  '0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000038d7ea4c6800600000000000000000000000000000000000000000000000000000000000186a0';
const EXPECTED_CONTRACT_BALANCE_1 = '0x038d7ea4c68006';
const EXPECTED_CONTRACT_BALANCE_2 = '0x0186a0';

const mockAccounts = {
  [VALID_ADDRESS]: { address: VALID_ADDRESS, balance: INITIAL_BALANCE_1 },
  [VALID_ADDRESS_TWO]: {
    address: VALID_ADDRESS_TWO,
    balance: INITIAL_BALANCE_2,
  },
};

function buildMockBlockTracker({ shouldStubListeners = true } = {}) {
  const blockTrackerStub = new EventEmitter();
  blockTrackerStub.getCurrentBlock = noop;
  blockTrackerStub.getLatestBlock = noop;
  if (shouldStubListeners) {
    jest.spyOn(blockTrackerStub, 'addListener').mockImplementation();
    jest.spyOn(blockTrackerStub, 'removeListener').mockImplementation();
  }
  return blockTrackerStub;
}

function buildAccountTracker({
  completedOnboarding = false,
  useMultiAccountBalanceChecker = false,
  ...accountTrackerOptions
} = {}) {
  const { provider } = createTestProviderTools({
    scaffold: {
      eth_getBalance: UPDATE_BALANCE,
      eth_call: ETHERS_CONTRACT_BALANCES_ETH_CALL_RETURN,
      eth_getBlockByNumber: { gasLimit: GAS_LIMIT },
    },
    networkId: currentNetworkId,
    chainId: currentNetworkId,
  });
  const blockTrackerStub = buildMockBlockTracker();

  const providerFromHook = createTestProviderTools({
    scaffold: {
      eth_getBalance: UPDATE_BALANCE_HOOK,
      eth_call: ETHERS_CONTRACT_BALANCES_ETH_CALL_RETURN,
      eth_getBlockByNumber: { gasLimit: GAS_LIMIT_HOOK },
    },
    networkId: '0x1',
    chainId: '0x1',
  }).provider;

  const blockTrackerFromHookStub = buildMockBlockTracker();

  const getNetworkClientByIdStub = jest.fn().mockReturnValue({
    configuration: {
      chainId: '0x1',
    },
    blockTracker: blockTrackerFromHookStub,
    provider: providerFromHook,
  });

  const controllerMessenger = new ControllerMessenger();
  controllerMessenger.registerActionHandler(
    'AccountsController:getSelectedAccount',
    () => ({
      id: 'accountId',
      address: SELECTED_ADDRESS,
    }),
  );

  const accountTracker = new AccountTracker({
    provider,
    blockTracker: blockTrackerStub,
    getNetworkClientById: getNetworkClientByIdStub,
    getNetworkIdentifier: jest.fn(),
    preferencesController: {
      state: {
        useMultiAccountBalanceChecker,
      },
    },
    onboardingController: {
      state: {
        completedOnboarding,
      },
    },
    controllerMessenger,
    onAccountRemoved: noop,
    getCurrentChainId: () => currentChainId,
    ...accountTrackerOptions,
  });

  return { accountTracker, blockTrackerFromHookStub, blockTrackerStub };
}

describe('Account Tracker', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('start', () => {
    it('restarts the subscription to the block tracker and update accounts', async () => {
      const { accountTracker, blockTrackerStub } = buildAccountTracker();
      const updateAccountsSpy = jest
        .spyOn(accountTracker, 'updateAccounts')
        .mockResolvedValue();

      accountTracker.start();

      expect(blockTrackerStub.removeListener).toHaveBeenNthCalledWith(
        1,
        'latest',
        expect.any(Function),
      );
      expect(blockTrackerStub.addListener).toHaveBeenNthCalledWith(
        1,
        'latest',
        expect.any(Function),
      );
      expect(updateAccountsSpy).toHaveBeenNthCalledWith(1); // called first time with no args

      accountTracker.start();

      expect(blockTrackerStub.removeListener).toHaveBeenNthCalledWith(
        2,
        'latest',
        expect.any(Function),
      );
      expect(blockTrackerStub.addListener).toHaveBeenNthCalledWith(
        2,
        'latest',
        expect.any(Function),
      );
      expect(updateAccountsSpy).toHaveBeenNthCalledWith(2); // called second time with no args

      accountTracker.stop();
    });
  });

  describe('stop', () => {
    it('ends the subscription to the block tracker', async () => {
      const { accountTracker, blockTrackerStub } = buildAccountTracker();

      accountTracker.stop();

      expect(blockTrackerStub.removeListener).toHaveBeenNthCalledWith(
        1,
        'latest',
        expect.any(Function),
      );
    });
  });

  describe('startPollingByNetworkClientId', () => {
    it('should subscribe to the block tracker and update accounts if not already using the networkClientId', async () => {
      const { accountTracker, blockTrackerFromHookStub } =
        buildAccountTracker();

      const updateAccountsSpy = jest
        .spyOn(accountTracker, 'updateAccounts')
        .mockResolvedValue();

      accountTracker.startPollingByNetworkClientId('mainnet');

      expect(blockTrackerFromHookStub.addListener).toHaveBeenCalledWith(
        'latest',
        expect.any(Function),
      );
      expect(updateAccountsSpy).toHaveBeenCalledWith('mainnet');

      accountTracker.startPollingByNetworkClientId('mainnet');

      expect(blockTrackerFromHookStub.addListener).toHaveBeenCalledTimes(1);
      expect(updateAccountsSpy).toHaveBeenCalledTimes(1);

      accountTracker.stopAllPolling();
    });

    it('should subscribe to the block tracker and update accounts for each networkClientId', async () => {
      const blockTrackerFromHookStub1 = buildMockBlockTracker();
      const blockTrackerFromHookStub2 = buildMockBlockTracker();
      const blockTrackerFromHookStub3 = buildMockBlockTracker();
      const getNetworkClientByIdStub = jest
        .fn()
        .mockImplementation((networkClientId) => {
          switch (networkClientId) {
            case 'mainnet':
              return {
                configuration: {
                  chainId: '0x1',
                },
                blockTracker: blockTrackerFromHookStub1,
              };
            case 'goerli':
              return {
                configuration: {
                  chainId: '0x5',
                },
                blockTracker: blockTrackerFromHookStub2,
              };
            case 'networkClientId1':
              return {
                configuration: {
                  chainId: '0xa',
                },
                blockTracker: blockTrackerFromHookStub3,
              };
            default:
              throw new Error('unexpected networkClientId');
          }
        });
      const { accountTracker } = buildAccountTracker({
        getNetworkClientById: getNetworkClientByIdStub,
      });

      const updateAccountsSpy = jest
        .spyOn(accountTracker, 'updateAccounts')
        .mockResolvedValue();

      accountTracker.startPollingByNetworkClientId('mainnet');

      expect(blockTrackerFromHookStub1.addListener).toHaveBeenCalledWith(
        'latest',
        expect.any(Function),
      );
      expect(updateAccountsSpy).toHaveBeenCalledWith('mainnet');

      accountTracker.startPollingByNetworkClientId('goerli');

      expect(blockTrackerFromHookStub2.addListener).toHaveBeenCalledWith(
        'latest',
        expect.any(Function),
      );
      expect(updateAccountsSpy).toHaveBeenCalledWith('goerli');

      accountTracker.startPollingByNetworkClientId('networkClientId1');

      expect(blockTrackerFromHookStub3.addListener).toHaveBeenCalledWith(
        'latest',
        expect.any(Function),
      );
      expect(updateAccountsSpy).toHaveBeenCalledWith('networkClientId1');

      accountTracker.stopAllPolling();
    });
  });

  describe('stopPollingByPollingToken', () => {
    it('should unsubscribe from the block tracker when called with a valid polling that was the only active pollingToken for a given networkClient', async () => {
      const { accountTracker, blockTrackerFromHookStub } =
        buildAccountTracker();

      jest.spyOn(accountTracker, 'updateAccounts').mockResolvedValue();

      const pollingToken =
        accountTracker.startPollingByNetworkClientId('mainnet');

      accountTracker.stopPollingByPollingToken(pollingToken);

      expect(blockTrackerFromHookStub.removeListener).toHaveBeenCalledWith(
        'latest',
        expect.any(Function),
      );
    });

    it('should not unsubscribe from the block tracker if called with one of multiple active polling tokens for a given networkClient', async () => {
      const { accountTracker, blockTrackerFromHookStub } =
        buildAccountTracker();

      jest.spyOn(accountTracker, 'updateAccounts').mockResolvedValue();

      const pollingToken1 =
        accountTracker.startPollingByNetworkClientId('mainnet');
      accountTracker.startPollingByNetworkClientId('mainnet');

      accountTracker.stopPollingByPollingToken(pollingToken1);

      expect(blockTrackerFromHookStub.removeListener).not.toHaveBeenCalled();

      accountTracker.stopAllPolling();
    });

    it('should error if no pollingToken is passed', () => {
      const { accountTracker } = buildAccountTracker();

      expect(() => {
        accountTracker.stopPollingByPollingToken(undefined);
      }).toThrow('pollingToken required');
    });

    it('should error if no matching pollingToken is found', () => {
      const { accountTracker } = buildAccountTracker();

      expect(() => {
        accountTracker.stopPollingByPollingToken('potato');
      }).toThrow('pollingToken not found');
    });
  });

  describe('stopAll', () => {
    it('should end all subscriptions', async () => {
      const blockTrackerFromHookStub1 = buildMockBlockTracker();
      const blockTrackerFromHookStub2 = buildMockBlockTracker();
      const getNetworkClientByIdStub = jest
        .fn()
        .mockImplementation((networkClientId) => {
          switch (networkClientId) {
            case 'mainnet':
              return {
                configuration: {
                  chainId: '0x1',
                },
                blockTracker: blockTrackerFromHookStub1,
              };
            case 'goerli':
              return {
                configuration: {
                  chainId: '0x5',
                },
                blockTracker: blockTrackerFromHookStub2,
              };
            default:
              throw new Error('unexpected networkClientId');
          }
        });
      const { accountTracker, blockTrackerStub } = buildAccountTracker({
        getNetworkClientById: getNetworkClientByIdStub,
      });

      jest.spyOn(accountTracker, 'updateAccounts').mockResolvedValue();

      accountTracker.startPollingByNetworkClientId('mainnet');

      accountTracker.startPollingByNetworkClientId('goerli');

      accountTracker.stopAllPolling();

      expect(blockTrackerStub.removeListener).toHaveBeenCalledWith(
        'latest',
        expect.any(Function),
      );
      expect(blockTrackerFromHookStub1.removeListener).toHaveBeenCalledWith(
        'latest',
        expect.any(Function),
      );
      expect(blockTrackerFromHookStub2.removeListener).toHaveBeenCalledWith(
        'latest',
        expect.any(Function),
      );
    });
  });

  describe('blockTracker "latest" events', () => {
    it('updates currentBlockGasLimit, currentBlockGasLimitByChainId, and accounts when polling is initiated via `start`', async () => {
      const blockTrackerStub = buildMockBlockTracker({
        shouldStubListeners: false,
      });
      const { accountTracker } = buildAccountTracker({
        blockTracker: blockTrackerStub,
      });

      const updateAccountsSpy = jest
        .spyOn(accountTracker, 'updateAccounts')
        .mockResolvedValue();

      accountTracker.start();
      blockTrackerStub.emit('latest', 'blockNumber');

      await flushPromises();

      expect(updateAccountsSpy).toHaveBeenCalledWith(null);

      const newState = accountTracker.store.getState();

      expect(newState).toStrictEqual({
        accounts: {},
        accountsByChainId: {},
        currentBlockGasLimit: GAS_LIMIT,
        currentBlockGasLimitByChainId: {
          [currentChainId]: GAS_LIMIT,
        },
      });

      accountTracker.stop();
    });

    it('updates only the currentBlockGasLimitByChainId and accounts when polling is initiated via `startPollingByNetworkClientId`', async () => {
      const blockTrackerFromHookStub = buildMockBlockTracker({
        shouldStubListeners: false,
      });
      const providerFromHook = createTestProviderTools({
        scaffold: {
          eth_getBalance: UPDATE_BALANCE_HOOK,
          eth_call: ETHERS_CONTRACT_BALANCES_ETH_CALL_RETURN,
          eth_getBlockByNumber: { gasLimit: GAS_LIMIT_HOOK },
        },
        networkId: '0x1',
        chainId: '0x1',
      }).provider;
      const getNetworkClientByIdStub = jest.fn().mockReturnValue({
        configuration: {
          chainId: '0x1',
        },
        blockTracker: blockTrackerFromHookStub,
        provider: providerFromHook,
      });
      const { accountTracker } = buildAccountTracker({
        getNetworkClientById: getNetworkClientByIdStub,
      });

      const updateAccountsSpy = jest
        .spyOn(accountTracker, 'updateAccounts')
        .mockResolvedValue();

      accountTracker.startPollingByNetworkClientId('mainnet');

      blockTrackerFromHookStub.emit('latest', 'blockNumber');

      await flushPromises();

      expect(updateAccountsSpy).toHaveBeenCalledWith('mainnet');

      const newState = accountTracker.store.getState();

      expect(newState).toStrictEqual({
        accounts: {},
        accountsByChainId: {},
        currentBlockGasLimit: '',
        currentBlockGasLimitByChainId: {
          '0x1': GAS_LIMIT_HOOK,
        },
      });

      accountTracker.stopAllPolling();
    });
  });

  describe('updateAccountsAllActiveNetworks', () => {
    it('updates accounts for the globally selected network and all currently polling networks', async () => {
      const { accountTracker } = buildAccountTracker();

      const updateAccountsSpy = jest
        .spyOn(accountTracker, 'updateAccounts')
        .mockResolvedValue();
      await accountTracker.startPollingByNetworkClientId('networkClientId1');
      await accountTracker.startPollingByNetworkClientId('networkClientId2');
      await accountTracker.startPollingByNetworkClientId('networkClientId3');

      expect(updateAccountsSpy).toHaveBeenCalledTimes(3);

      await accountTracker.updateAccountsAllActiveNetworks();

      expect(updateAccountsSpy).toHaveBeenCalledTimes(7);
      expect(updateAccountsSpy).toHaveBeenNthCalledWith(4); // called with no args
      expect(updateAccountsSpy).toHaveBeenNthCalledWith(5, 'networkClientId1');
      expect(updateAccountsSpy).toHaveBeenNthCalledWith(6, 'networkClientId2');
      expect(updateAccountsSpy).toHaveBeenNthCalledWith(7, 'networkClientId3');
    });
  });

  describe('updateAccounts', () => {
    it('does not update accounts if completedOnBoarding is false', async () => {
      const { accountTracker } = buildAccountTracker({
        completedOnboarding: false,
      });

      await accountTracker.updateAccounts();

      const state = accountTracker.store.getState();
      expect(state).toStrictEqual({
        accounts: {},
        currentBlockGasLimit: '',
        accountsByChainId: {},
        currentBlockGasLimitByChainId: {},
      });
    });

    describe('chain does not have single call balance address', () => {
      const getCurrentChainIdStub = () => '0x999'; // chain without single call balance address
      const mockAccountsWithSelectedAddress = {
        ...mockAccounts,
        [SELECTED_ADDRESS]: {
          address: SELECTED_ADDRESS,
          balance: '0x0',
        },
      };
      const mockInitialState = {
        accounts: mockAccountsWithSelectedAddress,
        accountsByChainId: {
          '0x999': mockAccountsWithSelectedAddress,
        },
      };

      describe('when useMultiAccountBalanceChecker is true', () => {
        it('updates all accounts directly', async () => {
          const { accountTracker } = buildAccountTracker({
            completedOnboarding: true,
            useMultiAccountBalanceChecker: true,
            getCurrentChainId: getCurrentChainIdStub,
          });
          accountTracker.store.updateState(mockInitialState);

          await accountTracker.updateAccounts();

          const accounts = {
            [VALID_ADDRESS]: {
              address: VALID_ADDRESS,
              balance: UPDATE_BALANCE,
            },
            [VALID_ADDRESS_TWO]: {
              address: VALID_ADDRESS_TWO,
              balance: UPDATE_BALANCE,
            },
            [SELECTED_ADDRESS]: {
              address: SELECTED_ADDRESS,
              balance: UPDATE_BALANCE,
            },
          };

          const newState = accountTracker.store.getState();
          expect(newState).toStrictEqual({
            accounts,
            accountsByChainId: {
              '0x999': accounts,
            },
            currentBlockGasLimit: '',
            currentBlockGasLimitByChainId: {},
          });
        });
      });

      describe('when useMultiAccountBalanceChecker is false', () => {
        it('updates only the selectedAddress directly, setting other balances to null', async () => {
          const { accountTracker } = buildAccountTracker({
            completedOnboarding: true,
            useMultiAccountBalanceChecker: false,
            getCurrentChainId: getCurrentChainIdStub,
          });
          accountTracker.store.updateState(mockInitialState);

          await accountTracker.updateAccounts();

          const accounts = {
            [VALID_ADDRESS]: { address: VALID_ADDRESS, balance: null },
            [VALID_ADDRESS_TWO]: { address: VALID_ADDRESS_TWO, balance: null },
            [SELECTED_ADDRESS]: {
              address: SELECTED_ADDRESS,
              balance: UPDATE_BALANCE,
            },
          };

          const newState = accountTracker.store.getState();
          expect(newState).toStrictEqual({
            accounts,
            accountsByChainId: {
              '0x999': accounts,
            },
            currentBlockGasLimit: '',
            currentBlockGasLimitByChainId: {},
          });
        });
      });
    });

    describe('chain does have single call balance address and network is not localhost', () => {
      const getNetworkIdentifierStub = jest
        .fn()
        .mockReturnValue('http://not-localhost:8545');
      const controllerMessenger = new ControllerMessenger();
      controllerMessenger.registerActionHandler(
        'AccountsController:getSelectedAccount',
        () => ({
          id: 'accountId',
          address: VALID_ADDRESS,
        }),
      );
      const getCurrentChainIdStub = () => '0x1'; // chain with single call balance address
      const mockInitialState = {
        accounts: { ...mockAccounts },
        accountsByChainId: {
          '0x1': { ...mockAccounts },
        },
      };

      describe('when useMultiAccountBalanceChecker is true', () => {
        it('updates all accounts via balance checker', async () => {
          const { accountTracker } = buildAccountTracker({
            completedOnboarding: true,
            useMultiAccountBalanceChecker: true,
            controllerMessenger,
            getNetworkIdentifier: getNetworkIdentifierStub,
            getCurrentChainId: getCurrentChainIdStub,
          });

          accountTracker.store.updateState(mockInitialState);

          await accountTracker.updateAccounts('mainnet');

          const accounts = {
            [VALID_ADDRESS]: {
              address: VALID_ADDRESS,
              balance: EXPECTED_CONTRACT_BALANCE_1,
            },
            [VALID_ADDRESS_TWO]: {
              address: VALID_ADDRESS_TWO,
              balance: EXPECTED_CONTRACT_BALANCE_2,
            },
          };

          const newState = accountTracker.store.getState();
          expect(newState).toStrictEqual({
            accounts,
            accountsByChainId: {
              '0x1': accounts,
            },
            currentBlockGasLimit: '',
            currentBlockGasLimitByChainId: {},
          });
        });
      });
    });
  });

  describe('onAccountRemoved', () => {
    it('should remove an account from state', () => {
      let accountRemovedListener;
      const { accountTracker } = buildAccountTracker({
        onAccountRemoved: (callback) => {
          accountRemovedListener = callback;
        },
      });
      accountTracker.store.updateState({
        accounts: { ...mockAccounts },
        accountsByChainId: {
          [currentChainId]: {
            ...mockAccounts,
          },
          '0x1': {
            ...mockAccounts,
          },
          '0x2': {
            ...mockAccounts,
          },
        },
      });

      accountRemovedListener(VALID_ADDRESS);

      const newState = accountTracker.store.getState();

      const accounts = {
        [VALID_ADDRESS_TWO]: mockAccounts[VALID_ADDRESS_TWO],
      };

      expect(newState).toStrictEqual({
        accounts,
        accountsByChainId: {
          [currentChainId]: accounts,
          '0x1': accounts,
          '0x2': accounts,
        },
        currentBlockGasLimit: '',
        currentBlockGasLimitByChainId: {},
      });
    });
  });

  describe('clearAccounts', () => {
    it('should reset state', () => {
      const { accountTracker } = buildAccountTracker();

      accountTracker.store.updateState({
        accounts: { ...mockAccounts },
        accountsByChainId: {
          [currentChainId]: {
            ...mockAccounts,
          },
          '0x1': {
            ...mockAccounts,
          },
          '0x2': {
            ...mockAccounts,
          },
        },
      });

      accountTracker.clearAccounts();

      const newState = accountTracker.store.getState();

      expect(newState).toStrictEqual({
        accounts: {},
        accountsByChainId: {
          [currentChainId]: {},
        },
        currentBlockGasLimit: '',
        currentBlockGasLimitByChainId: {},
      });
    });
  });
});
