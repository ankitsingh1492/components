// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import clsx from 'clsx';
import React, { useRef, useState, useMemo } from 'react';

import InternalSpaceBetween from '../space-between/internal';
import InternalAutosuggest, { InternalAutosuggestProps } from '../autosuggest/internal';
import { InternalButton } from '../button/internal';
import { getBaseProps } from '../internal/base-component';
import useForwardFocus from '../internal/hooks/forward-focus';
import { applyDisplayName } from '../internal/utils/apply-display-name';
import { KeyCode } from '../internal/keycode';
import SelectToggle from '../token-group/toggle';
import { generateUniqueId } from '../internal/hooks/use-unique-id/index';
import { fireNonCancelableEvent } from '../internal/events';

import { PropertyFilterProps } from './interfaces';
import { Token } from './token';
import { getQueryActions, parseText, getAutosuggestOptions, ParsedText, getAllowedOperators } from './controller';
import { useLoadItems } from './use-load-items';
import styles from './styles.css.js';
import useBaseComponent from '../internal/hooks/use-base-component';

export { PropertyFilterProps };

const PropertyFilter = React.forwardRef(
  (
    {
      disabled,
      i18nStrings,
      countText,
      query,
      hideOperations,
      onChange,
      filteringProperties,
      filteringOptions,
      customGroupsText,
      disableFreeTextFiltering = false,
      onLoadItems,
      virtualScroll,
      customControl,
      filteringEmpty,
      filteringLoadingText,
      filteringFinishedText,
      filteringErrorText,
      filteringRecoveryText,
      filteringStatusType,
      asyncProperties,
      tokenLimit,
      expandToViewport,
      ...rest
    }: PropertyFilterProps,
    ref: React.Ref<PropertyFilterProps.Ref>
  ) => {
    const { __internalRootRef } = useBaseComponent('PropertyFilter');
    const inputRef = useRef<HTMLInputElement>(null);
    const preventFocus = useRef<boolean>(false);
    const baseProps = getBaseProps(rest);
    useForwardFocus(ref, inputRef);
    const { tokens, operation } = query;
    const showResults = tokens?.length && !disabled;
    const { addToken, removeToken, setToken, setOperation, removeAllTokens } = getQueryActions(
      query,
      onChange,
      inputRef,
      preventFocus
    );
    const [filteringText, setFilteringText] = useState<string>('');
    const parsedText = parseText(filteringText, filteringProperties, disableFreeTextFiltering);
    const autosuggestOptions = getAutosuggestOptions(
      parsedText,
      filteringOptions,
      filteringProperties,
      customGroupsText,
      i18nStrings
    );

    const createToken = (currentText: string) => {
      const parsedText = parseText(currentText, filteringProperties, disableFreeTextFiltering);
      let newToken: PropertyFilterProps.Token;
      switch (parsedText.step) {
        case 'property': {
          newToken = {
            propertyKey: parsedText.property.key,
            operator: parsedText.operator,
            value: parsedText.value,
          };
          break;
        }
        case 'free-text': {
          newToken = {
            operator: parsedText.operator || ':',
            value: parsedText.value,
          };
          break;
        }
        case 'operator': {
          newToken = {
            operator: ':',
            value: currentText,
          };
          break;
        }
      }
      if (disableFreeTextFiltering && !('propertyKey' in newToken)) {
        return;
      }
      addToken(newToken);
      setFilteringText('');
    };
    const ignoreKeyDown = useRef<boolean>(false);
    const handleKeyDown: InternalAutosuggestProps['onKeyDown'] = event => {
      if (filteringText && !ignoreKeyDown.current && event.detail.keyCode === KeyCode.enter) {
        createToken(filteringText);
      }
    };
    const getLoadMoreDetail = (parsedText: ParsedText, filteringText: string) => {
      const loadMoreDetail: {
        filteringProperty: PropertyFilterProps.FilteringProperty | undefined;
        filteringText: string;
        filteringOperator: PropertyFilterProps.ComparisonOperator | undefined;
      } = {
        filteringProperty: undefined,
        filteringText,
        filteringOperator: undefined,
      };
      if (parsedText.step === 'property') {
        loadMoreDetail.filteringProperty = parsedText.property;
        loadMoreDetail.filteringText = parsedText.value;
        loadMoreDetail.filteringOperator = parsedText.operator;
      }
      return loadMoreDetail;
    };
    const loadMoreDetail = getLoadMoreDetail(parsedText, filteringText);
    const inputLoadItemsHandlers = useLoadItems(
      onLoadItems,
      loadMoreDetail.filteringText,
      loadMoreDetail.filteringProperty,
      loadMoreDetail.filteringText,
      loadMoreDetail.filteringOperator
    );
    const asyncProps = {
      empty: filteringEmpty,
      loadingText: filteringLoadingText,
      finishedText: filteringFinishedText,
      errorText: filteringErrorText,
      recoveryText: filteringRecoveryText,
      statusType: filteringStatusType,
    };
    const asyncAutosuggestProps =
      !!filteringText.length || asyncProperties
        ? {
            ...inputLoadItemsHandlers,
            ...asyncProps,
          }
        : {};
    const handleSelected: InternalAutosuggestProps['__onOptionClick'] = event => {
      // The ignoreKeyDown flag makes sure `createToken` routine runs only once. Autosuggest's `onKeyDown` fires,
      // when an item is selected from the list using "enter" key.
      ignoreKeyDown.current = true;
      setTimeout(() => {
        ignoreKeyDown.current = false;
      }, 0);
      const { detail: option } = event;
      const value = option.value || '';
      if ('tokenValue' in option) {
        createToken((option as { tokenValue: string }).tokenValue);
        return;
      }
      // create a token from the 'use' option
      if (!('keepOpenOnSelect' in option)) {
        createToken(value);
        return;
      }

      // stop dropdown from closing
      event.preventDefault();
      const parsedText = parseText(value, filteringProperties, disableFreeTextFiltering);
      const loadMoreDetail = getLoadMoreDetail(parsedText, value);
      fireNonCancelableEvent(onLoadItems, { ...loadMoreDetail, firstPage: true, samePage: false });

      // Insert operator automatically if only one operator is defined for the given property.
      if (parsedText.step === 'operator') {
        const operators = getAllowedOperators(parsedText.property);
        if (value.trim() === parsedText.property.propertyLabel && operators.length === 1) {
          setFilteringText(parsedText.property.propertyLabel + ' ' + operators[0] + ' ');
        }
      }
    };
    const [tokensExpanded, setTokensExpanded] = useState(false);
    const toggleExpandedTokens = () => setTokensExpanded(!tokensExpanded);
    const hasHiddenOptions = tokenLimit !== undefined && tokens.length > tokenLimit;
    const slicedTokens = hasHiddenOptions && !tokensExpanded ? tokens.slice(0, tokenLimit) : tokens;
    const controlId = useMemo(() => generateUniqueId(), []);
    return (
      <span {...baseProps} className={clsx(baseProps.className, styles.root)} ref={__internalRootRef}>
        <div className={styles['search-field']}>
          {customControl && <div className={styles['custom-control']}>{customControl}</div>}
          <InternalAutosuggest
            virtualScroll={virtualScroll}
            enteredTextLabel={i18nStrings.enteredTextLabel}
            ref={inputRef}
            className={styles.input}
            ariaLabel={i18nStrings.filteringAriaLabel}
            placeholder={i18nStrings.filteringPlaceholder}
            value={filteringText}
            disabled={disabled}
            onKeyDown={handleKeyDown}
            {...autosuggestOptions}
            onChange={event => setFilteringText(event.detail.value)}
            empty={filteringEmpty}
            {...asyncAutosuggestProps}
            expandToViewport={expandToViewport}
            __disableShowAll={true}
            __dropdownWidth={300}
            __onOptionClick={handleSelected}
            __onOpen={e => {
              if (preventFocus.current) {
                e.preventDefault();
                preventFocus.current = false;
              }
            }}
            __hideEnteredTextOption={disableFreeTextFiltering && parsedText.step !== 'property'}
          />
          <span
            aria-live="polite"
            aria-atomic="true"
            className={clsx(styles.results, showResults && styles['results-visible'])}
          >
            {showResults ? countText : ''}
          </span>
        </div>
        {tokens && tokens.length > 0 && (
          <div className={styles.tokens}>
            <InternalSpaceBetween size="xs" direction="horizontal" id={controlId}>
              {slicedTokens.map((token, index) => (
                <Token
                  token={token}
                  first={index === 0}
                  operation={operation}
                  key={index}
                  removeToken={() => removeToken(index)}
                  setToken={(newToken: PropertyFilterProps.Token) => setToken(index, newToken)}
                  setOperation={setOperation}
                  filteringOptions={filteringOptions}
                  filteringProperties={filteringProperties}
                  asyncProps={asyncProps}
                  onLoadItems={onLoadItems}
                  i18nStrings={i18nStrings}
                  asyncProperties={asyncProperties}
                  hideOperations={hideOperations}
                  customGroupsText={customGroupsText}
                  disableFreeTextFiltering={disableFreeTextFiltering}
                  disabled={disabled}
                  expandToViewport={expandToViewport}
                />
              ))}
              {hasHiddenOptions && (
                <div className={styles['toggle-collapsed']}>
                  <SelectToggle
                    controlId={controlId}
                    allHidden={tokenLimit === 0}
                    expanded={tokensExpanded}
                    numberOfHiddenOptions={tokens.length - slicedTokens.length}
                    i18nStrings={{
                      limitShowFewer: i18nStrings.tokenLimitShowFewer,
                      limitShowMore: i18nStrings.tokenLimitShowMore,
                    }}
                    onClick={toggleExpandedTokens}
                  />
                </div>
              )}
              <div className={styles.separator} />
              <InternalButton onClick={removeAllTokens} className={styles['remove-all']} disabled={disabled}>
                {i18nStrings.clearFiltersText}
              </InternalButton>
            </InternalSpaceBetween>
          </div>
        )}
      </span>
    );
  }
);

applyDisplayName(PropertyFilter, 'PropertyFilter');
export default PropertyFilter;
