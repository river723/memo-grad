/**
 * 后台公告 Tab：CRUD。
 */
import React, { useState, useEffect, useCallback } from 'react';
import { View, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { Card, Text, Button, FAB, Portal, Modal, TextInput, SegmentedButtons, IconButton } from 'react-native-paper';
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
    list: { padding: 8, paddingBottom: 100 },
    card: { marginBottom: 8, backgroundColor: c.surface },
    title: { fontSize: 14, fontWeight: '600', color: c.onSurface },
    body: { fontSize: 12, color: c.onSurfaceVariant, marginTop: 4, lineHeight: 18 },
    meta: { fontSize: 11, color: c.onSurfaceVariant, marginTop: 8 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', minHeight: 200 },
    error: { color: c.error, marginBottom: 12 },
    fab: { position: 'absolute', right: 16, bottom: 16 },
    modal: { backgroundColor: c.surface, padding: 16, margin: 16, borderRadius: 8 },
    input: { marginBottom: 8, backgroundColor: c.surface },
  }));
  const styles = useStyles();

  const [list, setList] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snack, setSnack] = useState<string | null>(null);
  const [createVisible, setCreateVisible] = useState(false);

  // 表单状态
  const def = defaultDates();
  const [form, setForm] = useState<CreateAnnouncementParams>({
    title: '', body: '', audience: 'all',
    startsAt: new Date(def.startsAt).toISOString(),
    endsAt: new Date(def.endsAt).toISOString(),
  });
  const [submitting, setSubmitting] = useState(false);

  const [confirmDialog, ConfirmNode] = useConfirmDialog();

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await AdminApi.listAnnouncements({ limit: 100 });
      setList(r.announcements);
    } catch (e: any) {
      setError(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
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
    } catch (e: any) {
      setSnack(e?.message || '创建失败');
    } finally {
      setSubmitting(false);
    }
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
    } catch (e: any) {
      setSnack(e?.message || '删除失败');
    }
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
      <ScrollView
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchData} />}
        contentContainerStyle={styles.list}
      >
        {list.length === 0 ? (
          <Text style={{ textAlign: 'center', color: colors.onSurfaceVariant, padding: 32 }}>
            暂无公告，点击右下角 + 新建
          </Text>
        ) : list.map((a) => (
          <Card key={a.id} style={styles.card}>
            <Card.Content>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={styles.title}>{a.title}</Text>
                <IconButton icon="delete" size={18} onPress={() => handleDelete(a)} />
              </View>
              <Text style={styles.body}>{a.body}</Text>
              <Text style={styles.meta}>
                受众：{a.audience === 'all' ? '全员' : 'Pro'} ·{' '}
                {new Date(a.startsAt).toLocaleString('zh-CN')} ~ {new Date(a.endsAt).toLocaleString('zh-CN')}
              </Text>
            </Card.Content>
          </Card>
        ))}
      </ScrollView>

      <FAB style={styles.fab} icon="plus" onPress={() => setCreateVisible(true)} />

      <Portal>
        <Modal visible={createVisible} onDismiss={() => setCreateVisible(false)} contentContainerStyle={styles.modal}>
          <ScrollView>
            <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 8 }}>新建公告</Text>
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
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <Button onPress={() => setCreateVisible(false)}>取消</Button>
              <Button mode="contained" loading={submitting} onPress={submit}>发布</Button>
            </View>
          </ScrollView>
        </Modal>
      </Portal>

      {ConfirmNode}
      {snack ? (
        <View style={{ position: 'absolute', bottom: 80, alignSelf: 'center', backgroundColor: colors.surfaceVariant, padding: 8, borderRadius: 4 }}>
          <Text onPress={() => setSnack(null)}>{snack}</Text>
        </View>
      ) : null}
    </View>
  );
}
