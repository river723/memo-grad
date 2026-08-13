/**
 * 公告 Banner：在 HomeScreen 顶部显示当前可见公告。
 * 用户 dismiss 后存 AsyncStorage，下次启动不再出现。
 */
import React from 'react';
import { View, ScrollView } from 'react-native';
import { Banner, Text, IconButton } from 'react-native-paper';
import { useAppTheme } from '../theme/theme';
import { useAnnouncements } from '../providers/AnnouncementProvider';

export default function AnnouncementBanner() {
  const { colors } = useAppTheme();
  const { visible, dismiss, refresh } = useAnnouncements();

  if (visible.length === 0) return null;

  // 多个公告时只显示第一个；点 "查看全部" 可展开
  const [expanded, setExpanded] = React.useState(false);
  const toShow = expanded ? visible : visible.slice(0, 1);

  return (
    <ScrollView style={{ maxHeight: expanded ? 320 : undefined }}>
      {toShow.map((a) => (
        <Banner
          key={a.id}
          visible
          icon={a.audience === 'pro' ? 'star' : 'bullhorn'}
          actions={
            visible.length > 1 ? [
              { label: expanded ? '收起' : `查看全部 (${visible.length})`, onPress: () => setExpanded(!expanded) },
            ] : undefined
          }
        >
          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '600', fontSize: 14 }}>{a.title}</Text>
              <Text style={{ fontSize: 12, color: colors.onSurfaceVariant, marginTop: 2 }}>
                {a.body}
              </Text>
            </View>
            <IconButton
              icon="close"
              size={18}
              onPress={() => dismiss(a.id)}
            />
          </View>
        </Banner>
      ))}
    </ScrollView>
  );
}
