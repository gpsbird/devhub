import React, { useCallback, useMemo, useRef } from 'react'
import { FlatList, FlatListProps, View } from 'react-native'

import {
  Column,
  constants,
  EnhancedGitHubEvent,
  isItemRead,
  LoadState,
} from '@devhub/core'
import { useKeyDownCallback } from '../../hooks/use-key-down-callback'
import { useKeyboardScrolling } from '../../hooks/use-keyboard-scrolling'
import { useReduxAction } from '../../hooks/use-redux-action'
import { useReduxState } from '../../hooks/use-redux-state'
import { ErrorBoundary } from '../../libs/bugsnag'
import * as actions from '../../redux/actions'
import * as selectors from '../../redux/selectors'
import { contentPadding } from '../../styles/variables'
import { Button } from '../common/Button'
import { FlatListWithOverlay } from '../common/FlatListWithOverlay'
import { EmptyCards, EmptyCardsProps } from './EmptyCards'
import { EventCard } from './EventCard'
import { CardItemSeparator } from './partials/CardItemSeparator'
import { SwipeableEventCard } from './SwipeableEventCard'

export interface EventCardsProps {
  column: Column
  columnIndex: number
  errorMessage: EmptyCardsProps['errorMessage']
  events: EnhancedGitHubEvent[]
  fetchNextPage: (() => void) | undefined
  loadState: LoadState
  refresh: EmptyCardsProps['refresh']
  repoIsKnown?: boolean
  swipeable?: boolean
}

export const EventCards = React.memo((props: EventCardsProps) => {
  const {
    column,
    columnIndex,
    errorMessage,
    events,
    fetchNextPage,
    loadState,
    refresh,
  } = props

  const flatListRef = React.useRef<FlatList<View>>(null)
  const visibleItemIndexesRef = useRef<number[]>([])

  const getVisibleItemIndex = useCallback(() => {
    if (
      !(visibleItemIndexesRef.current && visibleItemIndexesRef.current.length)
    )
      return

    return visibleItemIndexesRef.current[0]
  }, [])

  const [selectedItemId] = useKeyboardScrolling(flatListRef, {
    columnId: column.id,
    getVisibleItemIndex,
    items: events,
  })
  const selectedColumnId = useReduxState(selectors.selectedColumnSelector)
  const _hasSelectedItem = !!selectedItemId && column.id === selectedColumnId
  const selectedItem =
    _hasSelectedItem && events.find(event => event.id === selectedItemId)

  const markItemsAsReadOrUnread = useReduxAction(
    actions.markItemsAsReadOrUnread,
  )
  const saveItemsForLater = useReduxAction(actions.saveItemsForLater)

  useKeyDownCallback(
    e => {
      if (!selectedItem) return

      if (e.key === 's') {
        e.preventDefault()
        saveItemsForLater({
          itemIds: [selectedItemId!],
          save: !selectedItem.saved,
        })
      } else if (e.key === 'm') {
        e.preventDefault()
        markItemsAsReadOrUnread({
          type: 'activity',
          itemIds: [selectedItemId!],
          unread: isItemRead(selectedItem),
        })
      }
    },
    undefined,
    [events, selectedItem, selectedItemId],
  )

  const setColumnClearedAtFilter = useReduxAction(
    actions.setColumnClearedAtFilter,
  )

  const _handleViewableItemsChanged: FlatListProps<
    EnhancedGitHubEvent
  >['onViewableItemsChanged'] = ({ viewableItems }) => {
    visibleItemIndexesRef.current = viewableItems
      .filter(v => v.isViewable && typeof v.index === 'number')
      .map(v => v.index!)
  }
  const handleViewableItemsChanged = useCallback(
    _handleViewableItemsChanged,
    [],
  )

  const viewabilityConfig = useMemo(
    () => ({
      itemVisiblePercentThreshold: 100,
    }),
    [],
  )

  if (columnIndex && columnIndex >= constants.COLUMNS_LIMIT) {
    return (
      <EmptyCards
        clearedAt={column.filters && column.filters.clearedAt}
        columnId={column.id}
        errorMessage={`You have reached the limit of ${
          constants.COLUMNS_LIMIT
        } columns. This is to maintain a healthy usage of the GitHub API.`}
        errorTitle="Too many columns"
        fetchNextPage={undefined}
        loadState="error"
        refresh={undefined}
      />
    )
  }

  if (!(events && events.length)) {
    return (
      <EmptyCards
        clearedAt={column.filters && column.filters.clearedAt}
        columnId={column.id}
        errorMessage={errorMessage}
        fetchNextPage={fetchNextPage}
        loadState={loadState}
        refresh={refresh}
      />
    )
  }

  const keyExtractor: FlatListProps<
    EnhancedGitHubEvent
  >['keyExtractor'] = event => {
    return `event-card-${event.id}`
  }

  const renderItem: FlatListProps<EnhancedGitHubEvent>['renderItem'] = ({
    item: event,
  }) => {
    if (props.swipeable) {
      return (
        <SwipeableEventCard
          event={event}
          repoIsKnown={props.repoIsKnown}
          isSelected={
            column.id === selectedColumnId && event.id === selectedItemId
          }
        />
      )
    }

    return (
      <ErrorBoundary>
        <EventCard
          event={event}
          repoIsKnown={props.repoIsKnown}
          isSelected={
            column.id === selectedColumnId && event.id === selectedItemId
          }
        />
      </ErrorBoundary>
    )
  }

  function renderFooter() {
    return (
      <>
        <CardItemSeparator />

        {fetchNextPage ? (
          <View style={{ padding: contentPadding }}>
            <Button
              analyticsLabel={loadState === 'error' ? 'try_again' : 'load_more'}
              children={loadState === 'error' ? 'Oops. Try again' : 'Load more'}
              disabled={loadState !== 'loaded'}
              loading={
                loadState === 'loading_first' || loadState === 'loading_more'
              }
              onPress={fetchNextPage}
            />
          </View>
        ) : column.filters && column.filters.clearedAt ? (
          <View style={{ padding: contentPadding }}>
            <Button
              analyticsLabel="show_cleared"
              borderOnly
              children="Show cleared items"
              disabled={loadState !== 'loaded'}
              onPress={() => {
                setColumnClearedAtFilter({
                  clearedAt: null,
                  columnId: column.id,
                })

                if (refresh) refresh()
              }}
            />
          </View>
        ) : null}
      </>
    )
  }

  return (
    <FlatListWithOverlay
      ref={flatListRef}
      ItemSeparatorComponent={CardItemSeparator}
      ListFooterComponent={renderFooter}
      data={events}
      extraData={loadState}
      initialNumToRender={10}
      keyExtractor={keyExtractor}
      onViewableItemsChanged={handleViewableItemsChanged}
      removeClippedSubviews
      renderItem={renderItem}
      viewabilityConfig={viewabilityConfig}
    />
  )
})
