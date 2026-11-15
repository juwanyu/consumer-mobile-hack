import { useRef, useState } from 'react';
import { FlatList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ReelCard, type ReelItem } from '@/components/reel-card';
import { CommentsSheet } from '@/components/comments-sheet';
import { SendSheet } from '@/components/sheets';

export function ReelFeed({ items, tabBar = true }: { items: ReelItem[]; tabBar?: boolean }) {
  const insets = useSafeAreaInsets();
  const [height, setHeight] = useState(0);
  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState(false);
  const [commentsFor, setCommentsFor] = useState<ReelItem['_id'] | null>(null);
  const [sendFor, setSendFor] = useState<ReelItem | null>(null);
  const bottomInset = tabBar ? 0 : insets.bottom;
  const onViewable = useRef(({ viewableItems }: { viewableItems: Array<{ index?: number | null }> }) => {
    const first = viewableItems[0];
    if (first?.index != null) setActive(first.index);
  }).current;

  return (
    <View style={{ flex: 1 }} onLayout={(e) => setHeight(Math.round(e.nativeEvent.layout.height))}>
      {height > 0 ? (
        <FlatList
          data={items}
          keyExtractor={(m) => m._id}
          pagingEnabled
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
          getItemLayout={(_, index) => ({ length: height, offset: height * index, index })}
          windowSize={3}
          initialNumToRender={2}
          maxToRenderPerBatch={2}
          renderItem={({ item, index }) => (
            <ReelCard
              item={item}
              active={index === active && !commentsFor && !sendFor}
              height={height}
              bottomInset={bottomInset}
              muted={muted}
              onToggleMute={() => setMuted((m) => !m)}
              onComments={() => setCommentsFor(item._id)}
              onSend={() => setSendFor(item)}
            />
          )}
        />
      ) : null}
      <CommentsSheet movieId={commentsFor} onClose={() => setCommentsFor(null)} />
      <SendSheet movie={sendFor} onClose={() => setSendFor(null)} />
    </View>
  );
}
