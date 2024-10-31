import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import {
  BannerAlert,
  BannerAlertSeverity,
  Text,
  PopoverPosition,
} from '../../../components/component-library';
import {
  getBridgeQuotes,
  getValidationErrors,
} from '../../../ducks/bridge/selectors';
import { useI18nContext } from '../../../hooks/useI18nContext';
import {
  formatFiatAmount,
  formatTokenAmount,
  formatEtaInMinutes,
} from '../utils/quote';
import { useCountdownTimer } from '../../../hooks/bridge/useCountdownTimer';
import { getCurrentCurrency } from '../../../selectors';
import { getNativeCurrency } from '../../../ducks/metamask/metamask';
import {
  AlignItems,
  TextAlign,
  TextColor,
  TextVariant,
} from '../../../helpers/constants/design-system';
import { Row, Column, SpacerBox, Tooltip } from '../layout';
import { BRIDGE_MM_FEE_RATE } from '../../../../shared/constants/bridge';
import { BridgeQuotesModal } from './bridge-quotes-modal';

export const BridgeQuoteCard = () => {
  const t = useI18nContext();

  const { isLoading, activeQuote } = useSelector(getBridgeQuotes);
  const currency = useSelector(getCurrentCurrency);
  const ticker = useSelector(getNativeCurrency);
  const { isNoQuotesAvailable, isSrcAmountLessThan30 } =
    useSelector(getValidationErrors);

  const secondsUntilNextRefresh = useCountdownTimer();

  const [showAllQuotes, setShowAllQuotes] = useState(false);

  return (
    <>
      <BridgeQuotesModal
        isOpen={showAllQuotes}
        onClose={() => setShowAllQuotes(false)}
      />
      {activeQuote ? (
        <Column gap={3}>
          <Row alignItems={AlignItems.flexStart}>
            <Column textAlign={TextAlign.Left}>
              <Row gap={1}>
                <Text variant={TextVariant.bodyLgMedium}>{t('bestPrice')}</Text>
                <Tooltip
                  title={t('howQuotesWork')}
                  position={PopoverPosition.RightEnd}
                >
                  {t('howQuotesWorkExplanation', [BRIDGE_MM_FEE_RATE])}
                </Tooltip>
              </Row>
              <Text
                as={'a'}
                variant={TextVariant.bodySm}
                color={TextColor.primaryDefault}
                onClick={() => {
                  setShowAllQuotes(true);
                }}
              >
                {t('viewAllQuotes')}
              </Text>
            </Column>
            {!isLoading && (
              <SpacerBox>
                <Text color={TextColor.textMuted}>
                  {secondsUntilNextRefresh}
                </Text>
              </SpacerBox>
            )}
          </Row>
          <Column gap={1}>
            <Row>
              <Text color={TextColor.textAlternative}>
                {t('crossChainSwapRate')}
              </Text>
              <Text>{`1 ${
                activeQuote.quote.srcAsset.symbol
              } = ${formatTokenAmount(
                activeQuote.swapRate,
                activeQuote.quote.destAsset.symbol,
              )}`}</Text>
            </Row>
            <Row>
              <Text color={TextColor.textAlternative}>{t('networkFee')}</Text>
              <Row gap={1}>
                <Text color={TextColor.textMuted}>
                  {activeQuote.totalNetworkFee?.fiat
                    ? formatTokenAmount(
                        activeQuote.totalNetworkFee?.raw,
                        ticker,
                        6,
                      )
                    : undefined}
                </Text>
                <Text>
                  {formatFiatAmount(
                    activeQuote.totalNetworkFee?.fiat,
                    currency,
                  ) ??
                    formatTokenAmount(
                      activeQuote.totalNetworkFee?.raw,
                      ticker,
                      6,
                    )}
                </Text>
              </Row>
            </Row>
            <Row>
              <Text color={TextColor.textAlternative}>
                {t('estimatedTime')}
              </Text>
              <Text>
                {t('bridgeTimingMinutes', [
                  formatEtaInMinutes(
                    activeQuote.estimatedProcessingTimeInSeconds,
                  ),
                ])}
              </Text>
            </Row>
          </Column>
          {isNoQuotesAvailable && (
            <BannerAlert
              title={t('noOptionsAvailable')}
              severity={BannerAlertSeverity.Danger}
              description={
                isSrcAmountLessThan30
                  ? t('noOptionsAvailableLessThan30Message')
                  : t('noOptionsAvailableMessage')
              }
              textAlign={TextAlign.Left}
            />
          )}
        </Column>
      ) : null}
    </>
  );
};
