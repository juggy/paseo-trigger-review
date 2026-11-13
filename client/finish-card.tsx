import { useRpc, type PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { Icon, useToast } from "@getpaseo/plugin/client/ui";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { finishReviewRpc, type FinishCardData } from "../shared/rpc";

export function FinishCard({ item, theme, layout }: PluginTimelineItemProps<FinishCardData>) {
  const data = item.data;
  const finishReview = useRpc(finishReviewRpc);
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const finished = data.state === "finished";

  const styles = useMemo(
    () => ({
      card: {
        marginVertical: 8,
        padding: layout.compact ? 12 : 16,
        gap: 10,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface1,
      },
      header: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8 },
      title: { color: theme.colors.foreground, fontSize: 15, fontWeight: "600" as const },
      hint: { color: theme.colors.foregroundMuted, fontSize: 13 },
      summary: { color: theme.colors.statusSuccess, fontSize: 13 },
      button: {
        alignSelf: layout.compact ? ("stretch" as const) : ("flex-start" as const),
        flexDirection: "row" as const,
        alignItems: "center" as const,
        justifyContent: "center" as const,
        gap: 8,
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 8,
        backgroundColor: theme.colors.accent,
      },
      buttonText: { color: theme.colors.accentForeground, fontSize: 14, fontWeight: "600" as const },
    }),
    [theme, layout.compact],
  );

  async function onPress() {
    if (pending) return;
    setPending(true);
    try {
      const { summary } = await finishReview({ reviewerAgentId: data.reviewerAgentId });
      toast.show(summary || "Review finished", { variant: "success" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Icon
          name={finished ? "CircleCheck" : "ScanSearch"}
          size={16}
          color={finished ? theme.colors.statusSuccess : theme.colors.foreground}
        />
        <Text style={styles.title}>{finished ? "Review finished" : "Review complete?"}</Text>
      </View>
      {finished ? (
        <Text style={styles.summary}>{data.summary || "Done."}</Text>
      ) : (
        <>
          <Text style={styles.hint}>
            Finish review will: {data.actionLabel}. Keep chatting with the reviewer first if the
            findings need more work.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Finish review: ${data.actionLabel}`}
            disabled={pending}
            onPress={onPress}
            style={({ pressed }) => [styles.button, { opacity: pending || pressed ? 0.7 : 1 }]}
          >
            {pending ? (
              <ActivityIndicator size="small" color={theme.colors.accentForeground} />
            ) : (
              <Icon name="CheckCheck" size={16} color={theme.colors.accentForeground} />
            )}
            <Text style={styles.buttonText}>Finish review</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}
