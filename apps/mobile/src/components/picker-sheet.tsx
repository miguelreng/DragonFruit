import { Modal, Pressable, ScrollView, Text, View } from "react-native";

export type PickerOption = { id: string; label: string; color?: string };

/** Bottom-sheet single-select picker (used for changing work-item state). */
export function PickerSheet({
  visible,
  title,
  options,
  selectedId,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: PickerOption[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-black/40" onPress={onClose}>
        {/* Stop taps on the sheet itself from dismissing. */}
        <Pressable className="max-h-[70%] rounded-t-2xl bg-white pt-2 pb-8" onPress={() => {}}>
          <View className="mb-1 items-center pt-1">
            <View className="h-1 w-10 rounded-full bg-black/15" />
          </View>
          <Text className="text-xs text-muted px-5 py-2 font-medium uppercase">{title}</Text>
          <ScrollView>
            {options.map((option) => (
              <Pressable
                key={option.id}
                onPress={() => onSelect(option.id)}
                className="flex-row items-center gap-3 px-5 py-3 active:bg-black/5"
              >
                {option.color ? (
                  <View style={{ backgroundColor: option.color }} className="h-3 w-3 rounded-full" />
                ) : null}
                <Text className="text-base text-ink flex-1">{option.label}</Text>
                {option.id === selectedId ? <Text className="text-base text-accent">✓</Text> : null}
              </Pressable>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
