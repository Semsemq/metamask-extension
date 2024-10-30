import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { Hex } from '@metamask/utils';
import { getAddress } from 'ethers/lib/utils';
import { zeroAddress } from 'ethereumjs-util';
import { swapsSlice } from '../swaps/swaps';
import { SwapsTokenObject } from '../../../shared/constants/swaps';
import { SwapsEthToken } from '../../selectors';
import { fetchTokenExchangeRates } from '../../helpers/utils/util';
import {
  QuoteMetadata,
  QuoteResponse,
  SortOrder,
} from '../../pages/bridge/types';
// TODO: Remove restricted import
// eslint-disable-next-line import/no-restricted-paths
import { DEFAULT_SLIPPAGE } from '../../../app/scripts/controllers/bridge/constants';

export type BridgeState = {
  toChainId: Hex | null;
  fromToken: SwapsTokenObject | SwapsEthToken | null;
  toToken: SwapsTokenObject | SwapsEthToken | null;
  fromTokenInputValue: string | null;
  toTokenExchangeRate: number | null;
  toNativeExchangeRate: number | null;
  sortOrder: SortOrder;
  selectedQuote: (QuoteResponse & QuoteMetadata) | null;
  slippage: number;
};

const initialState: BridgeState = {
  toChainId: null,
  fromToken: null,
  toToken: null,
  fromTokenInputValue: null,
  toNativeExchangeRate: null,
  toTokenExchangeRate: null,
  sortOrder: SortOrder.ADJUSTED_RETURN_DESC,
  selectedQuote: null,
  slippage: DEFAULT_SLIPPAGE,
};

export const setDestTokenExchangeRates = createAsyncThunk(
  'bridge/setDestTokenExchangeRates',
  async (request: { chainId: Hex; tokenAddress: string; currency: string }) => {
    const { chainId, tokenAddress, currency } = request;
    const exchangeRates = await fetchTokenExchangeRates(
      currency,
      [getAddress(tokenAddress)],
      chainId,
    );
    return {
      toTokenExchangeRate:
        tokenAddress === zeroAddress()
          ? 1
          : exchangeRates?.[getAddress(tokenAddress)],
      toNativeExchangeRate: exchangeRates?.[zeroAddress()] ?? 1,
    };
  },
);

const bridgeSlice = createSlice({
  name: 'bridge',
  initialState: { ...initialState },
  reducers: {
    ...swapsSlice.reducer,
    setToChainId: (state, action) => {
      state.toChainId = action.payload;
    },
    setFromToken: (state, action) => {
      state.fromToken = action.payload;
    },
    setToToken: (state, action) => {
      state.toToken = action.payload;
    },
    setFromTokenInputValue: (state, action) => {
      state.fromTokenInputValue = action.payload;
    },
    resetInputFields: () => ({
      ...initialState,
    }),
    setSortOrder: (state, action) => {
      state.sortOrder = action.payload;
    },
    setSelectedQuote: (state, action) => {
      state.selectedQuote = action.payload;
    },
    setSlippage: (state, action) => {
      state.slippage = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(setDestTokenExchangeRates.fulfilled, (state, action) => {
      state.toNativeExchangeRate = action.payload.toNativeExchangeRate ?? null;
      state.toTokenExchangeRate = action.payload.toTokenExchangeRate ?? null;
    });
  },
});

export { bridgeSlice };
export default bridgeSlice.reducer;
