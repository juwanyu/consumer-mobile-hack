import { useRef, useState } from 'react';
import { FlatList, useWindowDimensions } from 'react-native';

import { ReelCard, type ReelItem } from '@/components/reel-card';

export function ReelFeed({ items, header }: { items: ReelItem[]; header?: React.ReactNode }) {
  const { height } = useWindowDimensions();
  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState(false);
  const onViewable = useRef(({ viewableItems }: { viewableItems: Array<{ index?: number | null }> }) => {
    const first = viewableItems[0];
    if (first?.index != null) setActive(first.index);
  }).current;

  return (
    <FlatList
      data={items}
      keyExtractor={(m) => m._id}
      pagingEnabled
      snapToInterval={height}
      decelerationRate="fast"
      showsVerticalScrollIndicator={false}
      onViewableItemsChanged={onViewable}
      viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
      getItemLayout={(_, index) => ({ length: height, offset: height * index, index })}
      windowSize={3}
      initialNumToRender={2}
      maxToRenderPerBatch={2}
      renderItem={({ item, index }) => (
        <ReelCard item={item} active={index === active} height={height} muted={muted} onToggleMute={() => setMuted((m) => !m)} />
      )}
      ListHeaderComponent={header ? <>{header}</> : undefined}
    />
  );
}
