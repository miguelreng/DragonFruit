import { useLocalSearchParams } from "expo-router";
import { ActivityIndicator, FlatList, RefreshControl, Text, View } from "react-native";

import { ScreenHeader } from "@/components/screen-header";
import { getCycles, type Cycle } from "@/lib/api";
import { useApiList } from "@/lib/use-api-list";

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  upcoming: "Upcoming",
  completed: "Completed",
  draft: "Draft",
};

// Manual formatting — Hermes' Intl is limited, so avoid toLocaleDateString.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDay(value: string): string {
  const date = new Date(value);
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

function formatRange(start: string | null, end: string | null): string | null {
  if (start && end) return `${formatDay(start)} – ${formatDay(end)}`;
  if (start || end) return formatDay((start ?? end) as string);
  return null;
}

export default function CyclesScreen() {
  const { workspaceSlug, projectId, name } = useLocalSearchParams<{
    workspaceSlug: string;
    projectId: string;
    name?: string;
  }>();
  const {
    data: cycles,
    loading,
    refreshing,
    error,
    onRefresh,
  } = useApiList<Cycle>(() => getCycles(workspaceSlug, projectId), [workspaceSlug, projectId]);

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title={name ?? "Cycles"} subtitle={name ? "Cycles" : undefined} />

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#e445a6" />
        </View>
      ) : (
        <FlatList
          data={cycles}
          keyExtractor={(cycle) => cycle.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#e445a6" />}
          ListEmptyComponent={
            <Text className="text-sm text-muted mt-10 text-center">{error ?? "No cycles in this project yet."}</Text>
          }
          renderItem={({ item }) => {
            const range = formatRange(item.start_date, item.end_date);
            const pct = item.total_issues > 0 ? Math.round((item.completed_issues / item.total_issues) * 100) : 0;
            return (
              <View className="mb-2 rounded-xl border border-black/5 bg-white p-4">
                <View className="flex-row items-center justify-between gap-2">
                  <Text className="text-base text-ink flex-1 font-medium" numberOfLines={1}>
                    {item.name}
                  </Text>
                  {item.status ? (
                    <View className="bg-accent/10 rounded-full px-2 py-0.5">
                      <Text className="text-accent text-[11px] font-medium">
                        {STATUS_LABEL[item.status] ?? item.status}
                      </Text>
                    </View>
                  ) : null}
                </View>
                {range ? <Text className="text-xs text-muted mt-1">{range}</Text> : null}
                <Text className="text-xs text-muted mt-2">
                  {item.completed_issues}/{item.total_issues} done · {pct}%
                </Text>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}
