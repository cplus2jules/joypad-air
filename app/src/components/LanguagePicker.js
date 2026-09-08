import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useI18n } from '../i18n';

export default function LanguagePicker() {
  const { language, setLanguage, t } = useI18n();
  return (
    <View style={s.group} accessibilityLabel={t('language')}>
      {['en', 'es'].map((code) => (
        <Pressable
          key={code}
          accessibilityRole="radio"
          accessibilityState={{ checked: language === code }}
          accessibilityLanguage={code}
          onPress={() => setLanguage(code)}
          style={[s.option, language === code && s.selected]}
        >
          <Text style={[s.text, language === code && s.selectedText]}>
            {code === 'en' ? 'English' : 'Español'}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  group: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 6 },
  option: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: '#444b5b', backgroundColor: '#1b1f29' },
  selected: { borderColor: '#00c3e2', backgroundColor: '#183844' },
  text: { color: '#b7becb', fontSize: 14, fontWeight: '600' },
  selectedText: { color: '#f5f6f8' },
});
