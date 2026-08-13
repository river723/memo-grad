/**
 * 后台公告 Tab：CRUD。
 */
import React, { useState, useEffect, useCallback } from 'react';
import { View, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { Text, Button, Modal, TextInput, SegmentedButtons } from 'react-native-paper';
import { MaterialIcons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/theme';
import { makeStyles } from '../../utils/useStyles';
import { AdminApi } from '../../services/AdminApi';
import { useConfirmDialog } from './components/ConfirmDialog';
import type { Announcement, CreateAnnouncementParams } from './types';

function defaultDates() {
  const now = new Date();
  const start = new Date(now);
  start.setMinutes(0, 0, 0);
  start.setHours(now.getHours() + 1);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { startsAt: start.toISOString().slice(0, 16), endsAt: end.toISOString().slice(0, 16) };
}

export default function AdminAnnouncementsScreen() {
  const { colors } = useAppTheme();
  const useStyles = makeStyles((c) => ({
    container: { flex: 1, backgroundColor: c.background },
    // 新建按钮栏
    topBar: {
      flexDirection: 'row', justifyContent: 'flex-end',
      paddingHorizontal: 12, paddingVertical: 8,
      backgroundColor: c.surface,
      borderBottomWidth: 1, borderBottomColor: c.outline,
    },
    // 列表
    list: { padding: 10, paddingBottom: 40 },
    card: { marginBottom: 8, backgroundColor: c.surface, borderRadius: 10, elevation: 1, overflow: 'hidden' },
    cardHeader: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
      paddingHorizontal: 14, paddingVertical: 12,
    },
    cardTitle: { fontSize: 14, fontWeight: '700', color: c.onSurface, flex: 1, marginRight: 8 },
    cardBody: {
      paddingHorizontal: 14, paddingBottom: 10,
      fontSize: 12, color: c.onSurfaceVariant, lineHeight: 18,
    },
    cardMeta: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: 14, paddingVertical: 8,
      borderTopWidth: 1, borderTopColor: c.outline,
      backgroundColor: c.surfaceVariant,
    },
    metaText: { fontSize: 11, color: c.onSurfaceVariant },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', minHeight: 200 },
    error: { color: c.error, marginBottom: 12 },
    modal: { backgroundColor: c.surface, padding: 16, margin: 16, borderRadius: 12 },
    input: { marginBottom: 8, backgroundColor: c.surface },
    btnRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 },
    emptyBadge: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: 16, paddingVertical: 12,
      backgroundColor: c.surfaceVariant, borderRadius: 8,
      marginTop: 20,
    },
  }));
  const styles = useStyles();

  const [list, setList] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snack, setSnack] = useState<string | null>(null);
  const [createVisible, setCreateVisible] = useState(false);

  const def = defaultDates();
  const [form, setForm] = useState<CreateAnnouncementParams>({
    title: '', body: '', audience: 'all',
    startsAt: new Date(def.startsAt).toISOString(),
    endsAt: new Date(def.endsAt).toISOString(),
  });
  const [submitting, setSubmitting] = useState(false);

  const [confirmDialog, ConfirmNode] = useConfirmDialog();

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await AdminApi.listAnnouncements({ limit: 100 });
      setList(r.announcements);
    } catch (e: any) { setError(e?.message || '加载失败'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const submit = async () => {
    if (!form.title.trim() || !form.body.trim()) {
      setSnack('标题和正文不能为空');
      return;
    }
    setSubmitting(true);
    try {
      await AdminApi.createAnnouncement(form);
      setSnack('已创建');
      setCreateVisible(false);
      const d = defaultDates();
      setForm({ title: '', body: '', audience: 'all', startsAt: d.startsAt, endsAt: d.endsAt });
      fetchData();
    } catch (e: any) { setSnack(e?.message || '创建失败'); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (a: Announcement) => {
    const r = await confirmDialog({
      title: '确认删除公告',
      body: `公告「${a.title}」将被永久删除。此操作不可撤销。`,
      confirmText: '确认删除',
      danger: true,
    });
    if (!r.confirmed) return;
    try {
      await AdminApi.deleteAnnouncement(a.id);
      setSnack('已删除');
      fetchData();
    } catch (e: any) { setSnack(e?.message || '删除失败'); }
  };

  if (loading && list.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  if (error && list.length === 0) {
    return (
      <View style={styles.center}>
        <MaterialIcons name="error" size={48} color={colors.error} style={{ marginBottom: 8 }} />
        <Text style={styles.error}>{error}</Text>
        <Button mode="outlined" onPress={fetchData}>重试</Button>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* 顶部操作栏 */}
      <View style={styles.topBar}>
        <Button
          mode="contained"
          icon="plus"
          onPress={() => setCreateVisible(true)}
          compact
          buttonColor={colors.primary}
        >
          新建公告
        </Button>
      </View>

      {/* 公告列表 */}
      <ScrollView
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchData} />}
        contentContainerStyle={styles.list}
      >
        {list.length === 0 ? (
          <View style={styles.emptyBadge}>
            <MaterialIcons name="campaign" size={20} color={colors.onSurfaceVariant} />
            <Text style={{ fontSize: 13, color: colors.onSurfaceVariant }}>暂无公告</Text>
          </View>
        ) : list.map((a) => (
          <View key={a.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{a.title}</Text>
              <Button
                mode="text"
                compact
                onPress={() => handleDelete(a)}
                contentStyle={{ padding: 0 }}
                labelStyle={{ fontSize: 12, color: colors.error, padding: 0 }}
              >
                <MaterialIcons name="delete" size={16} color={colors.error} />
              </Button>
            </View>
            {a.body ? (
              <Text style={styles.cardBody}>{a.body}</Text>
            ) : null}
            <View style={styles.cardMeta}>
              <MaterialIcons name="visibility" size={12} color={colors.onSurfaceVariant} />
              <Text style={styles.metaText}>{a.audience === 'all' ? '全员' : 'Pro 订阅'}</Text>
              <MaterialIcons name="schedule" size={12} color={colors.onSurfaceVariant} style={{ marginLeft: 6 }} />
              <Text style={styles.metaText}>
                {new Date(a.startsAt).toLocaleString('zh-CN')} ~ {new Date(a.endsAt).toLocaleString('zh-CN')}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* 新建弹窗 */}
      <Modal
        visible={createVisible}
        onDismiss={() => setCreateVisible(false)}
        contentContainerStyle={styles.modal}
      >
        <ScrollView>
          <Text style={{ fontSize: 16, fontWeight: '700', marginBottom: 14, color: colors.onSurface }}>新建公告</Text>
          <TextInput
            mode="outlined"
            label="标题"
            value={form.title}
            onChangeText={(v) => setForm({ ...form, title: v })}
            style={styles.input}
          />
          <TextInput
            mode="outlined"
            label="正文"
            value={form.body}
            onChangeText={(v) => setForm({ ...form, body: v })}
            style={styles.input}
            multiline
            numberOfLines={4}
          />
          <SegmentedButtons
            value={form.audience}
            onValueChange={(v) => setForm({ ...form, audience: v as 'all' | 'pro' })}
            buttons={[
              { value: 'all', label: '全员' },
              { value: 'pro', label: 'Pro 订阅' },
            ]}
            style={{ marginBottom: 8 }}
          />
          <TextInput
            mode="outlined"
            label="开始时间 (ISO)"
            value={form.startsAt}
            onChangeText={(v) => setForm({ ...form, startsAt: new Date(v).toISOString() })}
            style={styles.input}
          />
          <TextInput
            mode="outlined"
            label="结束时间 (ISO)"
            value={form.endsAt}
            onChangeText={(v) => setForm({ ...form, endsAt: new Date(v).toISOString() })}
            style={styles.input}
          />
          <View style={styles.btnRow}>
            <Button onPress={() => setCreateVisible(false)}>取消</Button>
            <Button mode="contained" loading={submitting} onPress={submit} buttonColor={colors.primary}>
              发布
            </Button>
          </View>
        </ScrollView>
      </Modal>

      {ConfirmNode}
      {snack ? (
        <View style={{ position: 'absolute', bottom: 80, alignSelf: 'center', backgroundColor: colors.surfaceVariant, padding: 8, borderRadius: 4 }}>
          <Text onPress={() => setSnack(null)}>{snack}</Text>
        </View>
      ) : null}
    </View>
  );
}
