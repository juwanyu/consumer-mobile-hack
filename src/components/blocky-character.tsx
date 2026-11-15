import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import type { Look } from '../../convex/looks';

const HEX = /^#[0-9A-Fa-f]{6}$/;
const color = (value: string | undefined, fallback: string) => (value && HEX.test(value) ? value : fallback);

function shade(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16);
  const clamp = (c: number) => Math.max(0, Math.min(255, Math.round(c)));
  const r = clamp(((n >> 16) & 255) * (1 + amount));
  const g = clamp(((n >> 8) & 255) * (1 + amount));
  const b = clamp((n & 255) * (1 + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export function BlockyCharacter({ look, size = 220, animate = true }: { look: Look; size?: number; animate?: boolean }) {
  const u = size / 10;
  const skin = color(look.skin_tone, '#F2C29B');
  const hair = color(look.hair_color, '#2B1B10');
  const shirt = color(look.shirt_color, '#FF2E88');
  const pants = color(look.pants_color, '#1D3557');
  const bob = useRef(new Animated.Value(0)).current;
  const wave = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!animate) return;
    const loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(bob, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(bob, { toValue: 0, duration: 600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(wave, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(wave, { toValue: -1, duration: 600, useNativeDriver: true }),
          Animated.timing(wave, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [animate, bob, wave]);

  const translateY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -u * 0.4] });
  const armRotate = wave.interpolate({ inputRange: [-1, 1], outputRange: ['150deg', '190deg'] });

  const headW = u * 3.2;
  const headH = u * 3;
  const torsoW = u * 4;
  const torsoH = u * 4;
  const limbW = u * 2;
  const legH = u * 3.6;
  const sleeve = look.shirt_style === 'tanktop' ? skin : shirt;
  const totalW = torsoW + limbW * 2;

  return (
    <Animated.View style={{ width: totalW, height: u * 12, alignItems: 'center', transform: [{ translateY }] }}>
      <View style={{ width: headW, height: headH, marginTop: u * 0.8 }}>
        <Hair style={look.hair_style} color={hair} w={headW} h={headH} u={u} />
        <View style={[styles.block, { width: headW, height: headH, backgroundColor: skin, borderRadius: u * 0.6, borderColor: shade(skin, -0.25) }]}>
          <Face look={look} u={u} hair={hair} />
        </View>
        <HairFront style={look.hair_style} color={hair} w={headW} u={u} />
        <Accessory kind={look.accessory} w={headW} u={u} />
      </View>
      <View style={{ flexDirection: 'row' }}>
        <View style={[styles.block, { width: limbW, height: torsoH, backgroundColor: sleeve, borderColor: shade(sleeve, -0.25) }]}>
          <View style={{ position: 'absolute', bottom: 0, width: '100%', height: u * 0.9, backgroundColor: skin }} />
        </View>
        <Torso look={look} shirt={shirt} skin={skin} w={torsoW} h={torsoH} u={u} />
        <Animated.View
          style={[
            styles.block,
            {
              width: limbW,
              height: torsoH,
              backgroundColor: sleeve,
              borderColor: shade(sleeve, -0.25),
              transform: [{ translateY: -torsoH / 2 }, { rotate: armRotate }, { translateY: torsoH / 2 }],
            },
          ]}>
          <View style={{ position: 'absolute', bottom: 0, width: '100%', height: u * 0.9, backgroundColor: skin }} />
        </Animated.View>
      </View>
      {look.shirt_style === 'dress' ? (
        <View style={{ width: 0, height: 0, borderLeftWidth: torsoW * 0.65, borderRightWidth: torsoW * 0.65, borderBottomWidth: legH * 0.55, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: shirt, marginBottom: -legH * 0.55, zIndex: 2 }} />
      ) : null}
      <View style={{ flexDirection: 'row' }}>
        <View style={[styles.block, { width: limbW, height: legH, backgroundColor: pants, borderColor: shade(pants, -0.3) }]} />
        <View style={[styles.block, { width: limbW, height: legH, backgroundColor: pants, borderColor: shade(pants, -0.3) }]} />
      </View>
    </Animated.View>
  );
}

function Face({ look, u, hair }: { look: Look; u: number; hair: string }) {
  const eye = { width: u * 0.42, height: u * 0.62, borderRadius: u * 0.2, backgroundColor: '#111' };
  const lens = look.glasses === 'sunglasses' ? '#111' : 'transparent';
  return (
    <View style={{ flex: 1, alignItems: 'center', paddingTop: u * 1.05 }}>
      <View style={{ flexDirection: 'row', gap: u * 0.9 }}>
        <View style={eye} />
        <View style={eye} />
      </View>
      {look.glasses !== 'none' ? (
        <View style={{ position: 'absolute', top: u * 0.85, flexDirection: 'row', gap: u * 0.25, alignItems: 'center' }}>
          {[0, 1].map((i) => (
            <View
              key={i}
              style={{
                width: u * 1.15,
                height: u * 0.95,
                borderWidth: u * 0.16,
                borderColor: '#111',
                backgroundColor: lens,
                borderRadius: look.glasses === 'round' ? u : u * 0.15,
              }}
            />
          ))}
        </View>
      ) : null}
      {look.facial_hair === 'mustache' || look.facial_hair === 'goatee' ? (
        <View style={{ marginTop: u * 0.35, width: u * 1.4, height: u * 0.3, backgroundColor: hair, borderRadius: u * 0.1 }} />
      ) : null}
      <View
        style={{
          marginTop: look.facial_hair === 'mustache' || look.facial_hair === 'goatee' ? u * 0.08 : u * 0.45,
          width: u * 1.1,
          height: u * 0.5,
          borderBottomLeftRadius: u,
          borderBottomRightRadius: u,
          borderWidth: u * 0.14,
          borderTopWidth: 0,
          borderColor: '#111',
        }}
      />
      {look.facial_hair === 'beard' ? (
        <View style={{ position: 'absolute', bottom: 0, width: '100%', height: u * 1.1, backgroundColor: hair, borderBottomLeftRadius: u * 0.6, borderBottomRightRadius: u * 0.6, opacity: 0.95 }} />
      ) : null}
      {look.facial_hair === 'goatee' ? (
        <View style={{ position: 'absolute', bottom: 0, width: u * 1, height: u * 0.55, backgroundColor: hair, borderBottomLeftRadius: u * 0.3, borderBottomRightRadius: u * 0.3 }} />
      ) : null}
      {look.facial_hair === 'stubble' ? (
        <View style={{ position: 'absolute', bottom: 0, width: '100%', height: u * 0.9, backgroundColor: hair, opacity: 0.25, borderBottomLeftRadius: u * 0.6, borderBottomRightRadius: u * 0.6 }} />
      ) : null}
    </View>
  );
}

function Hair({ style, color, w, h, u }: { style: string; color: string; w: number; h: number; u: number }) {
  if (style === 'long' || style === 'ponytail') {
    return <View style={{ position: 'absolute', top: -u * 0.3, left: -u * 0.35, width: w + u * 0.7, height: style === 'long' ? h + u * 1.6 : h + u * 0.3, backgroundColor: color, borderRadius: u * 0.7 }} />;
  }
  if (style === 'afro' || style === 'curly') {
    const s = style === 'afro' ? 1.2 : 0.55;
    return <View style={{ position: 'absolute', top: -u * s * 1.4, left: -u * s, width: w + u * s * 2, height: h * 0.75 + u * s * 1.4, backgroundColor: color, borderRadius: u * 2 }} />;
  }
  return null;
}

function HairFront({ style, color, w, u }: { style: string; color: string; w: number; u: number }) {
  switch (style) {
    case 'bald':
      return null;
    case 'buzz':
      return <View style={{ position: 'absolute', top: 0, width: w, height: u * 0.45, backgroundColor: color, opacity: 0.8, borderTopLeftRadius: u * 0.6, borderTopRightRadius: u * 0.6 }} />;
    case 'mohawk':
      return <View style={{ position: 'absolute', top: -u * 1.2, left: w / 2 - u * 0.5, width: u, height: u * 1.5, backgroundColor: color, borderRadius: u * 0.2 }} />;
    case 'spiky':
      return (
        <View style={{ position: 'absolute', top: -u * 0.9, width: w, flexDirection: 'row', justifyContent: 'space-between' }}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={{ width: 0, height: 0, borderLeftWidth: u * 0.4, borderRightWidth: u * 0.4, borderBottomWidth: u * 1.3, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: color }} />
          ))}
        </View>
      );
    case 'bun':
      return (
        <>
          <View style={{ position: 'absolute', top: -u * 1.1, left: w / 2 - u * 0.8, width: u * 1.6, height: u * 1.3, backgroundColor: color, borderRadius: u }} />
          <View style={{ position: 'absolute', top: -u * 0.2, width: w, height: u * 0.9, backgroundColor: color, borderTopLeftRadius: u * 0.6, borderTopRightRadius: u * 0.6 }} />
        </>
      );
    case 'ponytail':
      return (
        <>
          <View style={{ position: 'absolute', top: -u * 0.2, width: w, height: u * 0.9, backgroundColor: color, borderTopLeftRadius: u * 0.6, borderTopRightRadius: u * 0.6 }} />
          <View style={{ position: 'absolute', top: u * 0.4, right: -u * 0.9, width: u * 0.9, height: u * 2.4, backgroundColor: color, borderRadius: u * 0.4 }} />
        </>
      );
    default:
      return <View style={{ position: 'absolute', top: -u * 0.25, width: w, height: u * 0.95, backgroundColor: color, borderTopLeftRadius: u * 0.6, borderTopRightRadius: u * 0.6 }} />;
  }
}

function Accessory({ kind, w, u }: { kind: string; w: number; u: number }) {
  switch (kind) {
    case 'cap':
      return (
        <>
          <View style={{ position: 'absolute', top: -u * 0.7, width: w, height: u * 1.1, backgroundColor: '#E63946', borderTopLeftRadius: u, borderTopRightRadius: u }} />
          <View style={{ position: 'absolute', top: u * 0.25, left: -u * 0.2, width: w * 0.7, height: u * 0.3, backgroundColor: '#B71C2C', borderRadius: u * 0.1 }} />
        </>
      );
    case 'beanie':
      return <View style={{ position: 'absolute', top: -u * 0.9, left: -u * 0.1, width: w + u * 0.2, height: u * 1.5, backgroundColor: '#2EE6FF', borderTopLeftRadius: u * 1.2, borderTopRightRadius: u * 1.2 }} />;
    case 'cowboy_hat':
      return (
        <>
          <View style={{ position: 'absolute', top: -u * 1.4, left: w * 0.15, width: w * 0.7, height: u * 1.3, backgroundColor: '#8B5A2B', borderTopLeftRadius: u * 0.5, borderTopRightRadius: u * 0.5 }} />
          <View style={{ position: 'absolute', top: -u * 0.2, left: -u * 0.9, width: w + u * 1.8, height: u * 0.4, backgroundColor: '#6B4220', borderRadius: u * 0.3 }} />
        </>
      );
    case 'crown':
      return (
        <View style={{ position: 'absolute', top: -u * 1.3, left: w * 0.15, width: w * 0.7, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={{ width: 0, height: 0, borderLeftWidth: u * 0.4, borderRightWidth: u * 0.4, borderBottomWidth: u * 1.1, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: '#FFD23F' }} />
          ))}
        </View>
      );
    case 'headphones':
      return (
        <>
          <View style={{ position: 'absolute', top: -u * 0.5, left: -u * 0.3, width: w + u * 0.6, height: u * 1.6, borderWidth: u * 0.3, borderBottomWidth: 0, borderColor: '#222', borderTopLeftRadius: u * 1.6, borderTopRightRadius: u * 1.6 }} />
          <View style={{ position: 'absolute', top: u * 0.9, left: -u * 0.6, width: u * 0.8, height: u * 1.2, backgroundColor: '#FF2E88', borderRadius: u * 0.2 }} />
          <View style={{ position: 'absolute', top: u * 0.9, right: -u * 0.6, width: u * 0.8, height: u * 1.2, backgroundColor: '#FF2E88', borderRadius: u * 0.2 }} />
        </>
      );
    default:
      return null;
  }
}

function Torso({ look, shirt, skin, w, h, u }: { look: Look; shirt: string; skin: string; w: number; h: number; u: number }) {
  return (
    <View style={[styles.block, { width: w, height: h, backgroundColor: shirt, borderColor: shade(shirt, -0.25), alignItems: 'center' }]}>
      {look.shirt_style === 'suit' ? (
        <>
          <View style={{ width: u * 1.2, height: h * 0.55, backgroundColor: '#FFFFFF' }} />
          <View style={{ position: 'absolute', top: 0, width: u * 0.45, height: h * 0.5, backgroundColor: '#C1121F' }} />
        </>
      ) : null}
      {look.shirt_style === 'hoodie' ? (
        <>
          <View style={{ width: w * 0.55, height: u * 0.8, backgroundColor: shade(shirt, -0.2), borderBottomLeftRadius: u, borderBottomRightRadius: u }} />
          <View style={{ position: 'absolute', bottom: u * 0.5, width: w * 0.6, height: u * 1, backgroundColor: shade(shirt, -0.12), borderRadius: u * 0.2 }} />
        </>
      ) : null}
      {look.shirt_style === 'jacket' ? (
        <View style={{ width: u * 0.25, height: h, backgroundColor: shade(shirt, -0.35) }} />
      ) : null}
      {look.shirt_style === 'tanktop' ? (
        <View style={{ width: w * 0.4, height: u * 0.7, backgroundColor: skin, borderBottomLeftRadius: u, borderBottomRightRadius: u }} />
      ) : null}
      {look.accessory === 'bowtie' ? (
        <View style={{ position: 'absolute', top: u * 0.1, flexDirection: 'row' }}>
          <View style={{ width: 0, height: 0, borderTopWidth: u * 0.35, borderBottomWidth: u * 0.35, borderLeftWidth: u * 0.6, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: '#111' }} />
          <View style={{ width: 0, height: 0, borderTopWidth: u * 0.35, borderBottomWidth: u * 0.35, borderRightWidth: u * 0.6, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderRightColor: '#111' }} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { borderWidth: 2, overflow: 'hidden' },
});
