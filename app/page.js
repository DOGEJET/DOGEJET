'use client'

import * as THREE from 'three'
import { useEffect, useRef, useState, useCallback } from 'react'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'

const SUPABASE_URL = 'https://dzptmtpimhdsxafafebb.supabase.co/storage/v1/object/public/dogejet-assets'
const ROCKET_MODEL = { id: 'doge', name: '🐕 Doge Rocket', file: `${SUPABASE_URL}/doge-draco.glb`, scale: 6.5, color: 0xffcc00 }

// 업적 데이터
const ACHIEVEMENTS = [
  { id: 'first_shot', name: '첫 사격', desc: '레이저를 처음 발사', condition: (stats) => stats.shots >= 1 },
  { id: 'speed_6', name: '최고 속도', desc: '6단 가속 도달', condition: (stats) => stats.maxStage >= 6 },
  { id: 'destroy_10', name: '사냥꾼', desc: '10대 적 격추', condition: (stats) => stats.enemiesDestroyed >= 10 },
  { id: 'blackhole', name: '위험한 선택', desc: '블랙홀 500 이내 접근', condition: (stats) => stats.approachedBlackhole },
  { id: 'asteroid', name: '돌격대원', desc: '운석 5개 파괴', condition: (stats) => stats.asteroidsDestroyed >= 5 },
  { id: 'distance_10k', name: '탐험가', desc: '10,000m 비행', condition: (stats) => stats.distance >= 10000 },
  { id: 'kill_boss', name: '보스 사냥꾼', desc: '보스 우주선 격추', condition: (stats) => stats.bossKilled },
  { id: 'full_booster', name: '풀 부스터', desc: '부스터 100% 사용', condition: (stats) => stats.usedFullBooster },
]

// 파워업 타입
const POWERUPS = [
  { type: 'shield', name: '🛡️ 방어막', color: 0x00ffff, duration: 10000 },
  { type: 'rapidfire', name: '⚡ 연사', color: 0xffff00, duration: 8000 },
  { type: 'tripleshot', name: '🔱 3발사격', color: 0xff00ff, duration: 8000 },
  { type: 'speed', name: '💨 가속', color: 0x00ff00, duration: 12000 },
  { type: 'life', name: '❤️ 체력', color: 0xff6666, duration: 0 },
]

// 행성별 스케일 (지구 scale=0.01 기준)
// 지구를 (0,0,0)에 고정하고 태양부터 순서대로 배치
const PLANETS = [
  { name: 'Sun', file: `${SUPABASE_URL}/Sun-draco.glb`, scale: 0.5, x: -250, z: 0, isStar: true },
  { name: 'Mercury', file: `${SUPABASE_URL}/Mercury_1_4878-draco.glb`, scale: 0.01, x: -150, z: 0 },
  { name: 'Venus', file: `${SUPABASE_URL}/Venus_1_12103-draco.glb`, scale: 0.01, x: -80, z: 0 },
  { name: 'Earth', file: `${SUPABASE_URL}/Earth_1_12756-draco.glb`, scale: 0.01, x: 0, z: 0, hasMoon: true }, // 기준점
  { name: 'Mars', file: `${SUPABASE_URL}/24881_Mars_1_6792.glb`, scale: 0.01, x: 100, z: 0 },
  { name: 'Jupiter', file: `${SUPABASE_URL}/Jupiter_1_142984-draco.glb`, scale: 0.01, x: 250, z: 0 },
  { name: 'Saturn', file: `${SUPABASE_URL}/Saturn_1_120536-draco.glb`, scale: 0.01, x: 400, z: 0 },
  { name: 'Uranus', file: `${SUPABASE_URL}/uranus-draco.glb`, scale: 0.01, x: 520, z: 0 },
  { name: 'Neptune', file: `${SUPABASE_URL}/Neptune_1_49528-draco.glb`, scale: 0.01, x: 650, z: 0 },
]

// 태양 (0,0,0 기준) - 더 작게
const SUN_SCALE = 0.1
const SUN_X = 0
const SUN_Y = 0
const SUN_Z = 0

export default function Home() {
  const mountRef = useRef(null)
  const rocketGroupRef = useRef(null)
  const boosterRef = useRef(null)
  const loadedModelRef = useRef(null)
  const [hud, setHud] = useState({ speed: 0, distance: 0, stage: 0, booster: 100 })
  const [minimapZoom, setMinimapZoom] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [gameState, setGameState] = useState({ 
    health: 100, 
    shield: 0, 
    enemiesDestroyed: 0,
    score: 0,
    combo: 0,
    level: 1,
    powerups: { rapidfire: false, tripleshot: false, speed: false, shield: false }
  })

  const loadRocketModel = (rocketModel, group, boosterMesh, onComplete) => {
    const loader = new GLTFLoader()
    loader.load(
      rocketModel.file,
      (gltf) => {
        const model = gltf.scene
        model.scale.set(rocketModel.scale, rocketModel.scale, rocketModel.scale)
        group.add(model)
        
        const box = new THREE.Box3().setFromObject(model)
        const size = new THREE.Vector3()
        const center = new THREE.Vector3()
        box.getSize(size)
        box.getCenter(center)
        const tailX = box.min.x
        const tailY = box.min.y
        boosterMesh.position.set(tailX - size.x * -0.5, tailY - size.y * -0.19, center.z + size.z * 3.675)
        
        onComplete(model)
      },
      undefined,
      (error) => console.error('GLB 로딩 실패:', error)
    )
  }

  useEffect(() => {
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x050510)
    scene.fog = new THREE.FogExp2(0x050510, 0.0008)

    // 별 파티클
    const createParallaxLayer = ({ count, boxSize, color, size, opacity, parallax }) => {
      const geometry = new THREE.BufferGeometry()
      const positions = new Float32Array(count * 3)
      const half = boxSize / 2

      for (let i = 0; i < count; i++) {
        const idx = i * 3
        positions[idx] = (Math.random() - 0.5) * boxSize
        positions[idx + 1] = (Math.random() - 0.5) * boxSize
        positions[idx + 2] = (Math.random() - 0.5) * boxSize
      }

      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      const material = new THREE.PointsMaterial({
        color,
        size,
        transparent: true,
        opacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      })
      const points = new THREE.Points(geometry, material)
      scene.add(points)

      return { points, geometry, positions, half, parallax, baseSize: size }
    }

    const parallaxLayers = [
      createParallaxLayer({ count: 2400, boxSize: 2400, color: 0xffffff, size: 0.75, opacity: 0.55, parallax: 0.15 }),
      createParallaxLayer({ count: 1600, boxSize: 1600, color: 0xbad6ff, size: 0.9, opacity: 0.65, parallax: 0.45 }),
      createParallaxLayer({ count: 900, boxSize: 1200, color: 0xffffff, size: 1.2, opacity: 0.85, parallax: 0.85 }),
    ]

    // 유성우 효과
    const meteors = []
    for (let i = 0; i < 50; i++) {
      const meteorGeometry = new THREE.ConeGeometry(0.1, 3, 4)
      const meteorMaterial = new THREE.MeshBasicMaterial({ color: 0xffffaa, transparent: true, opacity: 0.8 })
      const meteor = new THREE.Mesh(meteorGeometry, meteorMaterial)
      meteor.rotation.z = Math.PI / 4
      meteor.position.set(
        (Math.random() - 0.5) * 800,
        Math.random() * 400 + 100,
        (Math.random() - 0.5) * 800
      )
      meteor.userData = { speed: Math.random() * 2 + 1, originalY: meteor.position.y }
      meteors.push(meteor)
      scene.add(meteor)
    }

    // 떠다니는 운석들 (충돌 가능)
    const asteroids = []
    const asteroidCount = 25
    for (let i = 0; i < asteroidCount; i++) {
      const asteroidGeometry = new THREE.DodecahedronGeometry(Math.random() * 2 + 1, 0)
      const asteroidMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x666666, 
        roughness: 0.9,
        metalness: 0.1
      })
      const asteroid = new THREE.Mesh(asteroidGeometry, asteroidMaterial)
      asteroid.position.set(
        (Math.random() - 0.5) * 600,
        (Math.random() - 0.5) * 300,
        (Math.random() - 0.5) * 600
      )
      asteroid.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI)
      asteroid.userData = {
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.08,
          (Math.random() - 0.5) * 0.08,
          (Math.random() - 0.5) * 0.08
        ),
        rotationSpeed: new THREE.Vector3(
          (Math.random() - 0.5) * 0.05,
          (Math.random() - 0.5) * 0.05,
          (Math.random() - 0.5) * 0.05
        )
      }
      asteroids.push(asteroid)
      scene.add(asteroid)
    }

    // 행성 GLB 모델 로드 헬퍼 함수
    const loadPlanetModel = (file, position, scale = 1, onComplete) => {
      const loader = new GLTFLoader()
      loader.load(
        file,
        (gltf) => {
          const model = gltf.scene
          model.scale.set(scale, scale, scale)
          model.position.copy(position)
          scene.add(model)
          if (onComplete) onComplete(model)
        },
        undefined,
        (error) => console.error(`${file} 로딩 실패:`, error)
      )
    }

    // PLANETS 배열로 모든 행성 로드 (z 값 적용, Sun 포함)
    PLANETS.forEach(planet => {
      // 행성 로드 ( PLANETS의 z 값 사용)
      loadPlanetModel(planet.file, new THREE.Vector3(planet.x, 0, planet.z || 0), planet.scale)
      
      // 달이 있는 경우 (지구)
      if (planet.hasMoon) {
        loadPlanetModel(`${SUPABASE_URL}/Moon-draco.glb`, new THREE.Vector3(planet.x + 3, 1, planet.z || 0), 0.0027)
      }
      
      // 토성에 링 추가
      if (planet.name === 'Saturn') {
        const ringGeometry = new THREE.RingGeometry(0.02, 0.035, 64)
        const ringMaterial = new THREE.MeshBasicMaterial({ 
          color: 0xccaa88, 
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.8
        })
        const ring = new THREE.Mesh(ringGeometry, ringMaterial)
        ring.rotation.x = Math.PI / 2
        ring.position.set(planet.x, 0, planet.z || 0)
        scene.add(ring)
      }
    })

    // 블랙홀 (자전하는 검은 구체)
    const blackholeGeometry = new THREE.SphereGeometry(12, 64, 64)
    const blackholeMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x000000,
      emissive: 0x000000,
      roughness: 0.3,
      metalness: 0.5
    })
    const blackhole = new THREE.Mesh(blackholeGeometry, blackholeMaterial)
    blackhole.position.set(1500, 0, 200) // 해왕성 더 뒤에 배치
    blackhole.userData = { rotationSpeed: 0.01, name: 'Blackhole' }
    scene.add(blackhole)

    // 블랙홀 아큐레션 디스크 (화려한 빛의 원환)
    const diskGroup = new THREE.Group()
    diskGroup.position.copy(blackhole.position)
    scene.add(diskGroup)
    
    // 여러 개의 화려한 원환들
    for (let i = 0; i < 8; i++) {
      const diskGeometry = new THREE.RingGeometry(13 + i * 1.5, 14 + i * 1.5, 64)
      const diskMaterial = new THREE.MeshBasicMaterial({ 
        color: new THREE.Color().setHSL(0.08 + i * 0.02, 1, 0.5 + i * 0.05),
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.6 - i * 0.05
      })
      const disk = new THREE.Mesh(diskGeometry, diskMaterial)
      disk.rotation.x = Math.PI / 2 + (Math.random() - 0.5) * 0.1
      diskGroup.add(disk)
    }
    
    // 내부 빛나는 코어
    const coreGeometry = new THREE.SphereGeometry(8, 32, 32)
    const coreMaterial = new THREE.MeshBasicMaterial({ 
      color: 0xffaa00,
      transparent: true,
      opacity: 0.3
    })
    const core = new THREE.Mesh(coreGeometry, coreMaterial)
    core.position.copy(blackhole.position)
    scene.add(core)

    // 블랙홀 포인트 라이트 (빛나는 효과)
    const blackholeLight = new THREE.PointLight(0xff6600, 2, 150)
    blackholeLight.position.copy(blackhole.position)
    scene.add(blackholeLight)

    // === 우주 광고판들 ===
    const billboards = []
    const adMessages = [
      '🌌 DOGE COIN 🚀 TO THE MOON! 🌙',
      '⚡ ENERGY DRINK ⚡ POWER UP!',
      '🛡️ SHIELD INSURANCE 🛡️ 50% OFF',
      '🚀 ROCKET FUEL 🔥 99.9% PURE!',
      '🎯 LASER GUNS 🎯 NOW 50% OFF!',
      '💎 DIAMOND ASTEROIDS 💎 FREE!',
      '🔥 COMBO ATTACK 🔥 USE SPACE!',
      '⭐ LEVEL UP ⭐ GET POINTS!',
      '🛒 GALAXY MART 🛒 OPEN 24/7!',
      '🎮 GAME OVER? 🎮 TRY AGAIN!',
    ]
    
    for (let i = 0; i < 10; i++) {
      const billboardGroup = new THREE.Group()
      
      // 광고판 프레임
      const frameGeom = new THREE.BoxGeometry(15, 6, 0.5)
      const frameMat = new THREE.MeshStandardMaterial({ 
        color: 0x444444, 
        metalness: 0.8, 
        roughness: 0.2 
      })
      const frame = new THREE.Mesh(frameGeom, frameMat)
      billboardGroup.add(frame)
      
      // 광고판 배경 (광발광)
      const bgGeom = new THREE.PlaneGeometry(14, 5)
      const hue = i / 10
      const bgMat = new THREE.MeshBasicMaterial({ 
        color: new THREE.Color().setHSL(hue, 0.8, 0.3),
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9
      })
      const bg = new THREE.Mesh(bgGeom, bgMat)
      bg.position.z = 0.3
      billboardGroup.add(bg)
      
      // 광고판 위치 (태양계 곳곳에 배치)
      const positions = [
        { x: -100, y: 30, z: -50 },
        { x: 100, y: -20, z: 100 },
        { x: -200, y: 50, z: 200 },
        { x: 300, y: 0, z: -100 },
        { x: -50, y: -40, z: 300 },
        { x: 400, y: 30, z: 150 },
        { x: -300, y: -30, z: -150 },
        { x: 150, y: 60, z: -300 },
        { x: -150, y: -50, z: 400 },
        { x: 500, y: 20, z: 300 },
      ]
      billboardGroup.position.set(positions[i].x, positions[i].y, positions[i].z)
      // 플레이어를 향하도록 설정 (animate에서 업데이트됨)
      billboardGroup.userData = {
        rotationSpeed: 0.001,
        pulsePhase: Math.random() * Math.PI * 2,
        message: adMessages[i],
        targetPosition: new THREE.Vector3(0, 0, -20) // 초기값
      }
      
      scene.add(billboardGroup)
      billboards.push(billboardGroup)
    }
    
    // 빛나는 입자들 (아큐레션 디스크 효과)
    const bhParticleCount = 200
    const bhParticleGeometry = new THREE.BufferGeometry()
    const bhParticlePositions = new Float32Array(bhParticleCount * 3)
    for (let i = 0; i < bhParticleCount * 3; i += 3) {
      const angle = Math.random() * Math.PI * 2
      const radius = 15 + Math.random() * 10
      bhParticlePositions[i] = Math.cos(angle) * radius
      bhParticlePositions[i + 1] = (Math.random() - 0.5) * 3
      bhParticlePositions[i + 2] = Math.sin(angle) * radius
    }
    bhParticleGeometry.setAttribute('position', new THREE.BufferAttribute(bhParticlePositions, 3))
    const bhParticleMaterial = new THREE.PointsMaterial({ 
      color: 0xffaa00, 
      size: 0.5, 
      transparent: true, 
      opacity: 0.8 
    })
    const bhParticles = new THREE.Points(bhParticleGeometry, bhParticleMaterial)
    bhParticles.position.copy(blackhole.position)
    scene.add(bhParticles)

    const rocketGroup = new THREE.Group()
    scene.add(rocketGroup)
    rocketGroupRef.current = rocketGroup

    // 1. 메인 불꽃 (분홍색/보라색)
    const flameGeometry = new THREE.ConeGeometry(0.3, 2, 8)
    const flameMaterial = new THREE.MeshBasicMaterial({
      color: 0xff3366,
      transparent: true,
      opacity: 0.9
    })
    const flame = new THREE.Mesh(flameGeometry, flameMaterial)
    flame.rotation.x = -Math.PI / 2
    flame.visible = false
    rocketGroup.add(flame)

    // 2. 내부 코어 (흰색/노란색)
    const coreFlameGeometry = new THREE.ConeGeometry(0.15, 1.5, 8)
    const coreFlameMaterial = new THREE.MeshBasicMaterial({
      color: 0xffff66,
      transparent: true,
      opacity: 1
    })
    const coreFlame = new THREE.Mesh(coreFlameGeometry, coreFlameMaterial)
    coreFlame.rotation.x = -Math.PI / 2
    coreFlame.visible = false
    rocketGroup.add(coreFlame)

    // 3. 파티클 시스템 (여러 색상)
    const particleCount = 100
    const particleGeometry = new THREE.BufferGeometry()
    const particlePositions = new Float32Array(particleCount * 3)
    const particleColors = []
    
    for (let i = 0; i < particleCount; i++) {
      particlePositions[i * 3] = (Math.random() - 0.5) * 0.4
      particlePositions[i * 3 + 1] = (Math.random() - 0.5) * 0.4
      particlePositions[i * 3 + 2] = Math.random() * 1.5
      
      const hue = Math.random() * 0.1 + 0.95
      const color = new THREE.Color().setHSL(hue % 1, 1, 0.5)
      particleColors.push(color.r, color.g, color.b)
    }
    
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3))
    particleGeometry.setAttribute('color', new THREE.Float32BufferAttribute(particleColors, 3))
    
    const particleMaterial = new THREE.PointsMaterial({
      size: 0.2,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending
    })
    
    const flameParticles = new THREE.Points(particleGeometry, particleMaterial)
    flameParticles.visible = false
    rocketGroup.add(flameParticles)

    // 4. 글로우 후광
    const glowGeometry = new THREE.SphereGeometry(0.5, 16, 16)
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0xff6600,
      transparent: true,
      opacity: 0.4
    })
    const glow = new THREE.Mesh(glowGeometry, glowMaterial)
    glow.visible = false
    rocketGroup.add(glow)

    // 5. 충격파 링
    const ringGeometry = new THREE.RingGeometry(0.4, 0.6, 32)
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xffaa00,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide
    })
    const ring = new THREE.Mesh(ringGeometry, ringMaterial)
    ring.rotation.x = Math.PI / 2
    ring.visible = false
    rocketGroup.add(ring)

    // 기본 부스터 (호환성)
    const booster = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.4, 12), new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 1.2, transparent: true, opacity: 0.9 }))
    booster.rotation.x = Math.PI / 2
    booster.visible = false
    rocketGroup.add(booster)
    boosterRef.current = booster

    // === 우주 탐험 (공격 없음) ===
    // 적 우주선들 (비교용만 존재, 공격 안함)
    const enemies = []

    const lasers = []
    const missiles = []

    const laserColor = ROCKET_MODEL.color
    const laserSpeed = 2.5
    
    // 파워업 아이템들
    const powerups = []
    
    // 폭발 효과
    const explosions = []
    
    // 플레이어 체력과 쉴드
    let playerHealth = 100
    let playerShield = 0
    let shieldActive = false
    
    // 게임 통계
    const gameStats = {
      shots: 0,
      enemiesDestroyed: 0,
      asteroidsDestroyed: 0,
      distance: 0,
      maxStage: 0,
      approachedBlackhole: false,
      bossKilled: false,
      usedFullBooster: false,
      unlockedAchievements: [],
      score: 0,
      combo: 0,
      comboTimer: 0,
      screenShake: 0
    }
    
    // 업적 해제 상태
    const unlockedAchievements = new Set()
    
    // 레이어 생성 함수
    const createLaser = () => {
      const laserGeom = new THREE.CylinderGeometry(0.05, 0.05, 2, 8)
      const laserMat = new THREE.MeshBasicMaterial({ 
        color: laserColor,
        transparent: true,
        opacity: 0.9
      })
      const laser = new THREE.Mesh(laserGeom, laserMat)
      laser.rotation.x = Math.PI / 2
      
      const forward = new THREE.Vector3(0, 0, -1).applyEuler(rocketGroup.rotation)
      // 부스터 위치에서 발사
      const spawnPos = booster.position.clone()
      laser.position.copy(spawnPos).add(forward.clone().multiplyScalar(2))
      laser.userData = { velocity: forward.clone().multiplyScalar(laserSpeed) }
      
      scene.add(laser)
      lasers.push(laser)
      gameStats.shots++
    }
    
    // 3발 사격 (Triple Shot)
    const createTripleShot = () => {
      for (let i = -1; i <= 1; i++) {
        const laserGeom = new THREE.CylinderGeometry(0.05, 0.05, 2, 8)
        const laserMat = new THREE.MeshBasicMaterial({ 
          color: 0xff00ff,
          transparent: true,
          opacity: 0.9
        })
        const laser = new THREE.Mesh(laserGeom, laserMat)
        laser.rotation.x = Math.PI / 2
        
        const angleOffset = i * 0.15
        const quaternion = new THREE.Quaternion()
        quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), angleOffset)
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion).applyEuler(rocketGroup.rotation)
        
        laser.position.copy(rocketGroup.position).add(forward.clone().multiplyScalar(2))
        laser.userData = { velocity: forward.clone().multiplyScalar(laserSpeed) }
        
        scene.add(laser)
        lasers.push(laser)
      }
      gameStats.shots++
    }
    
    // 미사일 발사 - 미사일 기능 제거
    // const createMissile = () => {
    //   const missileGeom = new THREE.CylinderGeometry(0.1, 0.15, 3, 8)
    //   const missileMat = new THREE.MeshBasicMaterial({ 
    //     color: 0xff6600,
    //     transparent: true,
    //     opacity: 0.9
    //   })
    //   const missile = new THREE.Mesh(missileGeom, missileMat)
    //   missile.rotation.x = Math.PI / 2
      
    //   const forward = new THREE.Vector3(0, 0, -1).applyEuler(rocketGroup.rotation)
    //   missile.position.copy(rocketGroup.position).add(forward.clone().multiplyScalar(2))
    //   missile.userData = { 
    //     velocity: forward.clone().multiplyScalar(missileSpeed),
    //     target: null
    //   }
      
    //   // 미사일 궤적 효과
    //   const trailGeom = new THREE.BufferGeometry()
    //   const trailPositions = new Float32Array(30 * 3)
    //   trailGeom.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3))
    //   const trailMat = new THREE.PointsMaterial({ color: 0xffaa00, size: 0.3, transparent: true, opacity: 0.6 })
    //   const trail = new THREE.Points(trailGeom, trailMat)
    //   missile.add(trail)
    //   missile.userData.trail = trail
    //   missile.userData.trailPositions = []
      
    //   scene.add(missile)
    //   missiles.push(missile)
    // }
    
    
    
    
    // 파워업 생성
    const createPowerup = (position) => {
      const powerupType = POWERUPS[Math.floor(Math.random() * (POWERUPS.length - 1))] // life 제외
      
      const powerupGeom = new THREE.OctahedronGeometry(0.5, 0)
      const powerupMat = new THREE.MeshBasicMaterial({ 
        color: powerupType.color,
        transparent: true,
        opacity: 0.8
      })
      const powerup = new THREE.Mesh(powerupGeom, powerupMat)
      powerup.position.copy(position)
      powerup.userData = { type: powerupType.type, rotationSpeed: 0.05 }
      
      // 글로우 효과
      const glowGeom = new THREE.SphereGeometry(0.8, 16, 16)
      const glowMat = new THREE.MeshBasicMaterial({ 
        color: powerupType.color,
        transparent: true,
        opacity: 0.3
      })
      const glow = new THREE.Mesh(glowGeom, glowMat)
      powerup.add(glow)
      powerup.userData.glow = glow
      
      scene.add(powerup)
      powerups.push(powerup)
    }
    
    // 폭발 효과 생성
    const createExplosion = (position, size = 1) => {
      const particleCount = 30
      const explosionGroup = new THREE.Group()
      explosionGroup.position.copy(position)
      
      for (let i = 0; i < particleCount; i++) {
        const particleGeom = new THREE.SphereGeometry(0.1 * size, 8, 8)
        const hue = Math.random() * 0.1 + 0.05
        const particleMat = new THREE.MeshBasicMaterial({ 
          color: new THREE.Color().setHSL(hue, 1, 0.5),
          transparent: true,
          opacity: 1
        })
        const particle = new THREE.Mesh(particleGeom, particleMat)
        
        particle.userData = {
          velocity: new THREE.Vector3(
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 2
          ),
          life: 1
        }
        
        explosionGroup.add(particle)
      }
      
      scene.add(explosionGroup)
      explosions.push(explosionGroup)
    }
    
    
    let bossSpawned = false
    
    // 파워업 상태
    let activePowerups = {
      rapidfire: false,
      tripleshot: false,
      speed: false,
      shield: false
    }
    let lastShotTime = 0
    
    const dirLight = new THREE.DirectionalLight(0xffffff, 2.0) // 밝기 증가
    dirLight.position.set(10, 20, 10)
    scene.add(dirLight)
    scene.add(new THREE.AmbientLight(0xffffff, 0.6)) // 어비언트 라이트도 밝게

    // 카메라 설정
    // - FOV: 70 (넓은 시야각)
    // - far: 15000 (먼 거리까지 렌더링)
    // - 초기 위치: 태양계 전체가 보이도록 Z축 뒤로 배치
    const baseFov = 70
    const camera = new THREE.PerspectiveCamera(baseFov, window.innerWidth / (window.innerHeight * 0.85), 0.1, 15000)
    camera.position.set(0, 15, 120) // 태양계 전체가 보이도록 뒤로 배치
    const cameraOffset = new THREE.Vector3(0, 5, 15) // 우주선 뒤쪽 기본 오프셋

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    const mountEl = mountRef.current
    renderer.domElement.style.display = 'block'
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    mountEl?.appendChild(renderer.domElement)

    const updateRendererSize = () => {
      const rect = mountEl?.getBoundingClientRect()
      const nextWidth = Math.max(1, Math.floor(rect?.width ?? window.innerWidth))
      const nextHeight = Math.max(1, Math.floor(rect?.height ?? window.innerHeight * 0.85))
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
      renderer.setSize(nextWidth, nextHeight)
      camera.aspect = nextWidth / nextHeight
      camera.updateProjectionMatrix()
    }
    updateRendererSize()
    window.addEventListener('resize', updateRendererSize)

    const velocity = new THREE.Vector3()
    const baseAcceleration = 0.018
    const damping = 0.97
    const rotationSpeed = 0.04
    const boosterPower = 0.025
    let currentAcceleration = 0.008
    let speedStage = 0
    let boosterFuel = 100
    let forwardPressTime = 0

    const keys = {}
    const onKeyDown = (e) => (keys[e.code] = true)
    const onKeyUp = (e) => (keys[e.code] = false)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    // 마우스 드래그로 카메라 회전
    let isDragging = false
    let mouseX = 0
    let mouseY = 0
    let cameraYaw = 0
    let cameraPitch = 0
    
    const onMouseDown = (e) => {
      isDragging = true
      mouseX = e.clientX
      mouseY = e.clientY
    }
    
    const onMouseMove = (e) => {
      if (!isDragging) return
      const deltaX = e.clientX - mouseX
      const deltaY = e.clientY - mouseY
      cameraYaw -= deltaX * 0.003
      cameraPitch -= deltaY * 0.003
      // 위아래 각도 제한 (-80도 ~ 80도)
      cameraPitch = Math.max(-1.4, Math.min(1.4, cameraPitch))
      mouseX = e.clientX
      mouseY = e.clientY
    }
    
    const onMouseUp = () => {
      isDragging = false
    }
    
    // 드래그 영역을 canvas 전체로 확장
    const canvas = renderer.domElement
    canvas.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)

    // 우주선 초기 위치를 지구를 조금 앞으로 이동시킨 위치에 고정
    rocketGroup.position.set(0, 0, -20)
    
    loadRocketModel(ROCKET_MODEL, rocketGroup, booster, (model) => {
      loadedModelRef.current = model
      
      // 모든 불꽃 효과를 부스터 위치로 이동
      const bPos = booster.position
      flame.position.set(bPos.x, bPos.y, bPos.z + 0.8)
      coreFlame.position.set(bPos.x, bPos.y, bPos.z + 0.5)
      flameParticles.position.set(bPos.x, bPos.y, bPos.z)
      glow.position.set(bPos.x, bPos.y, bPos.z)
      ring.position.set(bPos.x, bPos.y, bPos.z + 1.2)
      
      setIsLoading(false)
    })

    let totalDistance = 0
    let hudFrame = 0
    let frameCount = 0
    const prevCameraPos = camera.position.clone()
    const cameraDelta = new THREE.Vector3()

    const animate = () => {
      requestAnimationFrame(animate)
      frameCount++

        
        
      
      // 파워업 업데이트
      for (let i = powerups.length - 1; i >= 0; i--) {
        const powerup = powerups[i]
        
        // 회전 효과
        powerup.rotation.y += powerup.userData.rotationSpeed
        powerup.userData.glow.scale.setScalar(1 + Math.sin(Date.now() * 0.005) * 0.2)
        
        // 플레이어와 충돌
        if (powerup.position.distanceTo(rocketGroup.position) < 5) {
          const type = powerup.userData.type
          
          if (type === 'shield') {
            shieldActive = true
            playerShield = 50
          } else if (type === 'rapidfire') {
            activePowerups.rapidfire = true
            setTimeout(() => { activePowerups.rapidfire = false }, POWERUPS[1].duration)
          } else if (type === 'tripleshot') {
            activePowerups.tripleshot = true
            setTimeout(() => { activePowerups.tripleshot = false }, POWERUPS[2].duration)
          } else if (type === 'speed') {
            activePowerups.speed = true
            setTimeout(() => { activePowerups.speed = false }, POWERUPS[3].duration)
          } else if (type === 'life') {
            playerHealth = Math.min(100, playerHealth + 30)
          }
          
          scene.remove(powerup)
          powerups.splice(i, 1)
        }
      }
      
      // 폭발 효과 업데이트
      for (let i = explosions.length - 1; i >= 0; i--) {
        const explosion = explosions[i]
        
        explosion.children.forEach(particle => {
          particle.position.add(particle.userData.velocity)
          particle.userData.velocity.multiplyScalar(0.95)
          particle.userData.life -= 0.02
          particle.material.opacity = particle.userData.life
          particle.scale.setScalar(particle.userData.life)
        })
        
        if (explosion.children[0].userData.life <= 0) {
          scene.remove(explosion)
          explosions.splice(i, 1)
        }
      }
      
      
      // 블랙홀 접근 체크
      if (rocketGroup.position.distanceTo(blackhole.position) < 500) {
        gameStats.approachedBlackhole = true
        // 블랙홀 인력 효과
        const toBlackhole = blackhole.position.clone().sub(rocketGroup.position).normalize()
        velocity.add(toBlackhole.multiplyScalar(0.002))
      }

      // === 기본 조작 ===
      
      if (keys['ArrowLeft']) rocketGroup.rotation.y += rotationSpeed
      if (keys['ArrowRight']) rocketGroup.rotation.y -= rotationSpeed

      if (keys['ArrowUp']) {
        forwardPressTime += 1/60
      } else {
        forwardPressTime = Math.max(0, forwardPressTime - 0.5)
      }
      
      speedStage = Math.min(6, Math.floor(forwardPressTime / 30))
      currentAcceleration = baseAcceleration * (1 + speedStage * 0.5)

      const forward = new THREE.Vector3(0, 0, -1).applyEuler(rocketGroup.rotation)
      const boost = (keys['KeyS'] && boosterFuel > 5) ? boosterPower : 0

      if (keys['ArrowUp']) {
        velocity.add(forward.clone().multiplyScalar(currentAcceleration + boost))
      }

      // 유성우 애니메이션
      meteors.forEach(meteor => {
        meteor.position.y -= meteor.userData.speed
        meteor.position.x -= meteor.userData.speed * 0.5
        if (meteor.position.y < -200) {
          meteor.position.y = meteor.userData.originalY + 300
          meteor.position.x = (Math.random() - 0.5) * 800
          meteor.position.z = (Math.random() - 0.5) * 800
        }
      })

      // 블랙홀 자전 애니메이션
      blackhole.rotation.y += blackhole.userData.rotationSpeed
      diskGroup.rotation.z -= 0.002
      bhParticles.rotation.z += 0.005

      // 운석 애니메이션 및 충돌 감지
      const rocketBox = new THREE.Box3().setFromObject(rocketGroup)
      asteroids.forEach(asteroid => {
        // 운석 이동
        asteroid.position.add(asteroid.userData.velocity)
        asteroid.rotation.x += asteroid.userData.rotationSpeed.x
        asteroid.rotation.y += asteroid.userData.rotationSpeed.y
        asteroid.rotation.z += asteroid.userData.rotationSpeed.z
        
        // 운석이 너무 멀어지면 반대쪽에서 다시 생성
        if (asteroid.position.distanceTo(rocketGroup.position) > 400) {
          asteroid.position.set(
            rocketGroup.position.x + (Math.random() - 0.5) * 200,
            rocketGroup.position.y + (Math.random() - 0.5) * 200,
            rocketGroup.position.z + (Math.random() - 0.5) * 200
          )
        }
        
        // 충돌 감지
        const asteroidBox = new THREE.Box3().setFromObject(asteroid)
        if (rocketBox.intersectsBox(asteroidBox)) {
          // 충돌 시 튕겨나감
          const bounceDir = rocketGroup.position.clone().sub(asteroid.position).normalize()
          velocity.add(bounceDir.multiplyScalar(0.08))
          asteroid.userData.velocity.add(bounceDir.multiplyScalar(-0.02))
          camera.position.x += (Math.random() - 0.5) * 0.8
          camera.position.y += (Math.random() - 0.5) * 0.8
        }
      })

      if (keys['KeyS'] && boosterFuel > 5) {
        booster.visible = true
        const fuelRatio = boosterFuel / 100
        const pulse = 0.3 + (fuelRatio * 0.8) + Math.random() * 0.12 * fuelRatio
        booster.scale.set(fuelRatio, pulse, fuelRatio)
        booster.material.opacity = 0.3 + fuelRatio * 0.6
        boosterFuel -= 0.3
        
        // 화려한 부스터 효과 표시
        const boostTime = Date.now() * 0.01
        
        // 메인 불꽃
        flame.visible = true
        flame.scale.set(1 + Math.sin(boostTime) * 0.2, 1 + Math.sin(boostTime * 1.5) * 0.3, 1)
        flame.rotation.z = boostTime * 0.5
        
        // 내부 코어
        coreFlame.visible = true
        coreFlame.scale.set(1 + Math.sin(boostTime * 2) * 0.1, 1 + Math.sin(boostTime * 2) * 0.2, 1)
        
        // 파티클 애니메이션
        flameParticles.visible = true
        const positions = flameParticles.geometry.attributes.position.array
        for (let i = 0; i < particleCount; i++) {
          positions[i * 3 + 2] += 0.1 + Math.random() * 0.1
          if (positions[i * 3 + 2] > 3) {
            positions[i * 3] = (Math.random() - 0.5) * 0.6
            positions[i * 3 + 1] = (Math.random() - 0.5) * 0.6
            positions[i * 3 + 2] = 0
          }
        }
        flameParticles.geometry.attributes.position.needsUpdate = true
        
        // 글로우 효과
        glow.visible = true
        glow.scale.set(1 + Math.sin(boostTime * 3) * 0.1, 1 + Math.sin(boostTime * 3) * 0.1, 1)
        
        // 충격파 링
        ring.visible = true
        ring.scale.set(1 + Math.sin(boostTime * 4) * 0.15, 1 + Math.sin(boostTime * 4) * 0.15, 1)
        ring.material.opacity = 0.4 + Math.sin(boostTime * 2) * 0.2
        
      } else {
        booster.visible = false
        flame.visible = false
        coreFlame.visible = false
        flameParticles.visible = false
        glow.visible = false
        ring.visible = false
        if (boosterFuel < 100) boosterFuel += 0.02
      }
      boosterFuel = Math.max(0, Math.min(100, boosterFuel))

      if (keys['KeyW']) {
        velocity.y += currentAcceleration
        rocketGroup.rotation.x = THREE.MathUtils.lerp(rocketGroup.rotation.x, Math.PI / 2, 0.05)
      }
      if (keys['KeyX']) {
        velocity.y -= currentAcceleration
        rocketGroup.rotation.x = THREE.MathUtils.lerp(rocketGroup.rotation.x, -Math.PI / 2, 0.05)
      }
      if (!keys['KeyW'] && !keys['KeyX']) {
        rocketGroup.rotation.x = THREE.MathUtils.lerp(rocketGroup.rotation.x, 0, 0.1)
      }

      rocketGroup.position.add(velocity)
      velocity.multiplyScalar(damping)

      const speed = velocity.length()
      const speedBoost = Math.min(1, speed * 2 + speedStage / 8)
      const targetFov = baseFov + Math.min(16, speed * 60 + speedStage * 1.5)
      camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 0.06)
      camera.updateProjectionMatrix()

      for (const layer of parallaxLayers) {
        layer.points.material.size = layer.baseSize * (1 + speedBoost * layer.parallax * 0.9)
      }
      totalDistance += speed

      hudFrame++
      if (hudFrame % 2 === 0) {
        setHud({
          speed: Number(speed.toFixed(2)),
          distance: Math.floor(totalDistance),
          stage: speedStage,
          booster: boosterFuel,
        })
        
        // 게임 상태 동기화 (HUD 업데이트)
        setGameState(prev => ({
          ...prev,
          health: playerHealth,
          shield: shieldActive ? playerShield : 0,
          enemiesDestroyed: gameStats.enemiesDestroyed,
          powerups: {
            rapidfire: activePowerups.rapidfire,
            tripleshot: activePowerups.tripleshot,
            speed: activePowerups.speed,
            shield: shieldActive
          }
        }))
        
        // 미니맵 줌 계산: 플레이어 거리에 따라 전체 행성이 보이도록
        const playerDist = Math.sqrt(
          Math.pow(rocketGroup.position.x, 2) + 
          Math.pow(rocketGroup.position.z, 2)
        )
        // 거리가 멀어질수록 줌 아웃 (최소 0.1, 최대 1.5)
        const zoom = Math.max(0.1, Math.min(1.5, 100 / (playerDist + 50)))
        setMinimapZoom(zoom)
        
        // 미니맵 플레이어 위치 실시간 업데이트 (0,0,0 기준)
        const minimapPlayer = document.getElementById('minimap-player')
        const minimapContainer = document.getElementById('minimap-container')
        const minimapPlanets = document.querySelectorAll('.minimap-planet')
        
        if (minimapPlayer && minimapContainer && rocketGroup) {
          const playerX = rocketGroup.position.x
          const playerZ = rocketGroup.position.z
          
          // (0,0,0) 기준 中央固定
          // 플레이어 위치를 기준으로 전체 줌
          const mapHalfSize = 100 // 220px / 2 - 10px padding
          
          // 플레이어 위치 (항상 중앙에서 상대적)
          const relX = playerX / 10 * zoom // 10 단위당 1%
          const relZ = playerZ / 10 * zoom
          
          minimapPlayer.style.left = `calc(50% - ${relX}%)`
          minimapPlayer.style.top = `calc(50% - ${relZ}%)`
          
          // 미니맵 컨테이너 트랜스폼으로 줌 적용
          minimapContainer.style.transform = `scale(${zoom})`
          minimapContainer.style.transformOrigin = 'center center'
          
          // 행성들 위치 업데이트 (0,0,0 기준)
          const planetPositions = [
            { name: 'Sun', x: -250, z: 0 },
            { name: 'Mercury', x: -150, z: 0 },
            { name: 'Venus', x: -80, z: 0 },
            { name: 'Earth', x: 0, z: 0 },
            { name: 'Mars', x: 100, z: 0 },
            { name: 'Jupiter', x: 250, z: 0 },
            { name: 'Saturn', x: 400, z: 0 },
            { name: 'Uranus', x: 520, z: 0 },
            { name: 'Neptune', x: 650, z: 0 },
            { name: 'Blackhole', x: 1500, z: 200 },
          ]
          
          planetPositions.forEach((planet, index) => {
            const el = document.getElementById(`minimap-${planet.name}`)
            if (el) {
              // (0,0,0) 기준 중앙에서 상대 위치
              const planetRelX = (planet.x - playerX) / 10 * zoom
              const planetRelZ = (planet.z - playerZ) / 10 * zoom
              el.style.left = `calc(50% - ${planetRelX}%)`
              el.style.top = `calc(50% - ${planetRelZ}%)`
            }
          })
        }
      }

      // 마우스 드래그로 카메라 회전 적용 + Smooth Follow
      const rotatedOffset = new THREE.Vector3(0, 5, 15)
      rotatedOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), cameraYaw)
      rotatedOffset.y += cameraPitch * 5
      
      const targetPosition = rocketGroup.position.clone().add(rotatedOffset)
      
      // Smooth Follow: lerp으로 부드럽게 따라가 (0.05 = 부드러운 지연)
      camera.position.lerp(targetPosition, 0.05)
      
      // 부드럽게 우주선을 바라봄
      const lookTarget = rocketGroup.position.clone()
      camera.lookAt(lookTarget)

      cameraDelta.subVectors(camera.position, prevCameraPos)
      prevCameraPos.copy(camera.position)

      if (cameraDelta.lengthSq() > 0) {
        for (const layer of parallaxLayers) {
          const { positions, half, parallax, geometry, points } = layer
          const moveX = cameraDelta.x * parallax
          const moveY = cameraDelta.y * parallax
          const moveZ = cameraDelta.z * parallax

          for (let i = 0; i < positions.length; i += 3) {
            positions[i] -= moveX
            positions[i + 1] -= moveY
            positions[i + 2] -= moveZ

            if (positions[i] > half) positions[i] -= half * 2
            else if (positions[i] < -half) positions[i] += half * 2

            if (positions[i + 1] > half) positions[i + 1] -= half * 2
            else if (positions[i + 1] < -half) positions[i + 1] += half * 2

            if (positions[i + 2] > half) positions[i + 2] -= half * 2
            else if (positions[i + 2] < -half) positions[i + 2] += half * 2
          }

          geometry.attributes.position.needsUpdate = true
          points.position.copy(camera.position)
        }
      }

      renderer.render(scene, camera)
    }

    animate()

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('resize', updateRendererSize)
      canvas.removeEventListener('mousedown', onMouseDown)
      mountEl?.removeChild(renderer.domElement)
      renderer.dispose()
    }
  }, [])

  const speedVibe = Math.min(0.7, Math.max(0, hud.speed * 1.6 + hud.stage * 0.04))

  return (
    <main style={{ height: '100vh', background: '#0b1020', position: 'relative', overflow: 'hidden' }}>
      <style jsx>{`
        @keyframes pulse-border {
          0%, 100% { border-color: rgba(100, 150, 255, 0.3); box-shadow: 0 0 30px rgba(60, 120, 255, 0.2); }
          50% { border-color: rgba(100, 200, 255, 0.6); box-shadow: 0 0 50px rgba(60, 150, 255, 0.4); }
        }
        @keyframes speed-sweep {
          from { transform: translate3d(0, 0, 0); }
          to { transform: translate3d(-220px, 0, 0); }
        }
        @keyframes spin-ring {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes glow-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.1); opacity: 0.8; }
        }
        @keyframes blackhole-pulse {
          0%, 100% { box-shadow: 0 0 25px #ff4400, 0 0 50px rgba(255, 100, 0, 0.5); }
          50% { box-shadow: 0 0 35px #ff6600, 0 0 70px rgba(255, 150, 0, 0.7); }
        }
        @keyframes star-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
      
      {isLoading && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: 'white', fontSize: 18, zIndex: 200 }}>
          🚀 로켓 로딩 중...
        </div>
      )}

      
        {/* 미니맵 (왼쪽 상단) - (0,0,0) 기준 中央固定 */}
        <div id="minimap-container" style={{
          position: 'fixed',
          top: 20,
          left: 20,
          width: 220,
          height: 220,
          background: 'linear-gradient(135deg, rgba(10, 20, 40, 0.95) 0%, rgba(5, 10, 25, 0.98) 100%)',
          border: '3px solid rgba(100, 150, 255, 0.4)',
          borderRadius: '50%',
          overflow: 'hidden',
          zIndex: 100,
          boxShadow: '0 0 40px rgba(60, 120, 255, 0.3), inset 0 0 60px rgba(0, 0, 0, 0.6)',
          transition: 'transform 0.3s ease-out'
        }}>
          {/* 미니맵 배경 */}
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(circle at 50% 50%, rgba(20, 40, 80, 0.5) 0%, rgba(0, 0, 0, 0.9) 100%)'
          }} />
          
          {/* 태양 */}
          <div id="minimap-Sun" style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 26,
            height: 26,
            background: 'radial-gradient(circle, #ffdd00 0%, #ff8800 50%, #ff4400 100%)',
            borderRadius: '50%',
            boxShadow: '0 0 25px #ff6600, 0 0 50px rgba(255, 100, 0, 0.6)',
            animation: 'glow-pulse 2s ease-in-out infinite',
            transform: 'translate(-50%, -50%)'
          }} />
          
          {/* 수성 */}
          <div id="minimap-Mercury" style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 10,
            height: 10,
            background: 'radial-gradient(circle, #aaaaaa 0%, #666666 100%)',
            borderRadius: '50%',
            boxShadow: '0 0 8px #888888',
            transform: 'translate(-50%, -50%)'
          }} />
          
          {/* 금성 */}
          <div id="minimap-Venus" style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 12,
            height: 12,
            background: 'radial-gradient(circle, #ffdd99 0%, #cc9955 100%)',
            borderRadius: '50%',
            boxShadow: '0 0 10px #ddaa77',
            transform: 'translate(-50%, -50%)'
          }} />
          
          {/* 지구 */}
          <div id="minimap-Earth" style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 14,
            height: 14,
            background: 'radial-gradient(circle at 30% 30%, #66aaff 0%, #2266cc 60%, #113388 100%)',
            borderRadius: '50%',
            boxShadow: '0 0 12px #4488ff, 0 0 25px rgba(50, 100, 255, 0.4)',
            transform: 'translate(-50%, -50%)'
          }} />
          
          {/* 화성 */}
          <div id="minimap-Mars" style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 12,
            height: 12,
            background: 'radial-gradient(circle at 30% 30%, #ff7755 0%, #cc4422 60%, #881100 100%)',
            borderRadius: '50%',
            boxShadow: '0 0 10px #ff5533',
            transform: 'translate(-50%, -50%)'
          }} />
          
          {/* 목성 */}
          <div id="minimap-Jupiter" style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 22,
            height: 22,
            background: 'radial-gradient(circle at 30% 30%, #eedd99 0%, #bb9955 60%, #886633 100%)',
            borderRadius: '50%',
            boxShadow: '0 0 15px #ddaa77',
            transform: 'translate(-50%, -50%)'
          }} />
          
          {/* 토성 */}
          <div id="minimap-Saturn" style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 18,
            height: 18,
            background: 'radial-gradient(circle at 40% 40%, #ffeecc 0%, #ddcc88 60%, #aa9966 100%)',
            borderRadius: '50%',
            boxShadow: '0 0 12px #eedd99',
            transform: 'translate(-50%, -50%)'
          }} />
          
          {/* 천왕성 */}
          <div id="minimap-Uranus" style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 14,
            height: 14,
            background: 'radial-gradient(circle, #99ddff 0%, #5599cc 100%)',
            borderRadius: '50%',
            boxShadow: '0 0 10px #66bbff',
            transform: 'translate(-50%, -50%)'
          }} />
          
          {/* 해왕성 */}
          <div id="minimap-Neptune" style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 14,
            height: 14,
            background: 'radial-gradient(circle, #5599ff 0%, #3366cc 100%)',
            borderRadius: '50%',
            boxShadow: '0 0 10px #4488ff',
            transform: 'translate(-50%, -50%)'
          }} />
          
          {/* 블랙홀 */}
          <div id="minimap-Blackhole" style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 20,
            height: 20,
            background: 'radial-gradient(circle, #000 40%, #220 60%, #660 80%, #ff6600 100%)',
            borderRadius: '50%',
            boxShadow: '0 0 30px #ff4400, 0 0 60px rgba(255, 100, 0, 0.6)',
            animation: 'blackhole-pulse 3s ease-in-out infinite',
            transform: 'translate(-50%, -50%)'
          }} />
          
          {/* 플레이어 로켓 - (0,0,0) 기준에서 위치 */}
          <div id="minimap-player" style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 14,
            height: 14,
            background: '#ffff00',
            borderRadius: '50%',
            border: '3px solid #ff8800',
            boxShadow: '0 0 25px #ffff00, 0 0 50px rgba(255, 255, 0, 0.8)',
            zIndex: 20,
            transform: 'translate(-50%, -50%)'
          }} />
        </div>
        
        {/* 미니맵 외곽 링 */}
        <div style={{
          position: 'absolute',
          inset: -5,
          borderRadius: '50%',
          border: '2px solid transparent',
          borderTopColor: 'rgba(100, 200, 255, 0.6)',
          animation: 'spin-ring 6s linear infinite',
          pointerEvents: 'none'
        }} />
        

      {/* 현재 좌표 표시 */}
      <div style={{
        position: 'absolute',
        top: 20,
        right: 20,
        background: 'linear-gradient(135deg, rgba(20, 30, 50, 0.95) 0%, rgba(10, 15, 30, 0.98) 100%)',
        border: '2px solid rgba(100, 150, 255, 0.4)',
        borderRadius: 12,
        padding: '14px 18px',
        color: 'white',
        fontFamily: '"Segoe UI", monospace',
        fontSize: 13,
        zIndex: 100,
        boxShadow: '0 0 25px rgba(60, 120, 255, 0.3)'
      }}>
        <div style={{ color: 'rgba(150, 200, 255, 0.8)', fontSize: 11, marginBottom: 6, letterSpacing: 2 }}>COORDINATES</div>
        <div style={{ display: 'flex', gap: 16 }}>
          <span><span style={{ color: '#66ff66' }}>X</span>: {(rocketGroupRef.current?.position.x || 0).toFixed(0)}</span>
          <span><span style={{ color: '#ffcc00' }}>Y</span>: {(rocketGroupRef.current?.position.y || 0).toFixed(0)}</span>
          <span><span style={{ color: '#ff66ff' }}>Z</span>: {(rocketGroupRef.current?.position.z || 0).toFixed(0)}</span>
        </div>
      </div>

      {/* 목표물 거리 */}
      <div style={{
        position: 'absolute',
        top: 110,
        right: 20,
        background: 'linear-gradient(135deg, rgba(30, 25, 20, 0.95) 0%, rgba(20, 15, 10, 0.98) 100%)',
        border: '2px solid rgba(255, 180, 50, 0.4)',
        borderRadius: 12,
        padding: '12px 18px',
        color: 'white',
        fontFamily: '"Segoe UI", monospace',
        fontSize: 13,
        zIndex: 100,
        boxShadow: '0 0 25px rgba(255, 180, 50, 0.3)'
      }}>
        <div style={{ color: 'rgba(255, 200, 100, 0.8)', fontSize: 11, marginBottom: 6, letterSpacing: 2 }}>TARGET DISTANCE</div>
        <div style={{ color: '#ffcc00', fontSize: 18, fontWeight: 'bold' }}>
          {Math.abs((rocketGroupRef.current?.position.z || 0) - (-120)).toFixed(0)} m
        </div>
      </div>

      {/* 체력/쉴드 표시 */}
      <div style={{
        position: 'absolute',
        top: 200,
        right: 20,
        background: 'linear-gradient(135deg, rgba(30, 20, 30, 0.95) 0%, rgba(20, 10, 20, 0.98) 100%)',
        border: '2px solid rgba(255, 100, 100, 0.4)',
        borderRadius: 12,
        padding: '12px 18px',
        color: 'white',
        fontFamily: '"Segoe UI", monospace',
        fontSize: 13,
        zIndex: 100,
        boxShadow: '0 0 25px rgba(255, 50, 50, 0.3)'
      }}>
        <div style={{ color: 'rgba(255, 150, 150, 0.8)', fontSize: 11, marginBottom: 6, letterSpacing: 2 }}>HP / SHIELD</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* 체력 바 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: '#ff6666' }}>❤</span>
            <div style={{ display: 'inline-block', width: 80, height: 10, background: 'rgba(60, 20, 20, 0.8)', borderRadius: 5, overflow: 'hidden', border: '1px solid rgba(255, 100, 100, 0.3)' }}>
              <div style={{ 
                display: 'block', 
                width: `${gameState.health}%`, 
                height: '100%', 
                background: `linear-gradient(90deg, #ff3333, #ff6666)`,
                transition: 'width 0.3s ease-out'
              }} />
            </div>
          </div>
          {/* 쉴드 바 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: '#66ffff' }}>🛡</span>
            <div style={{ display: 'inline-block', width: 60, height: 8, background: 'rgba(20, 40, 50, 0.8)', borderRadius: 4, overflow: 'hidden', border: '1px solid rgba(100, 255, 255, 0.3)' }}>
              <div style={{ 
                display: 'block', 
                width: `${gameState.shield}%`, 
                height: '100%', 
                background: `linear-gradient(90deg, #00aaaa, #66ffff)`,
                transition: 'width 0.3s ease-out'
              }} />
            </div>
          </div>
        </div>
      </div>

      {/* 점수/콤보/레벨 */}
      <div style={{
        position: 'absolute',
        top: 280,
        right: 20,
        background: 'linear-gradient(135deg, rgba(30, 25, 20, 0.95) 0%, rgba(20, 15, 10, 0.98) 100%)',
        border: '2px solid rgba(255, 150, 50, 0.4)',
        borderRadius: 12,
        padding: '12px 18px',
        color: 'white',
        fontFamily: '"Segoe UI", monospace',
        fontSize: 13,
        zIndex: 100,
        boxShadow: '0 0 25px rgba(255, 150, 50, 0.3)'
      }}>
        <div style={{ color: 'rgba(255, 200, 100, 0.8)', fontSize: 11, marginBottom: 6, letterSpacing: 2 }}>STATS</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>⭐</span>
            <span style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 'bold', color: '#ffcc00' }}>{gameState.score.toLocaleString()}</span>
            <span style={{ fontSize: 11, opacity: 0.7 }}>points</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>🔥</span>
            <span style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 'bold', color: '#ff6644' }}>x{gameState.combo}</span>
            <span style={{ fontSize: 11, opacity: 0.7 }}>combo</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>⚔️</span>
            <span style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 'bold', color: '#66ff66' }}>Lv.{gameState.level}</span>
            <span style={{ fontSize: 11, opacity: 0.7 }}>level</span>
          </div>
        </div>
      </div>


      {/* 조작법 */}
      <div style={{
        position: 'absolute',
        top: 20,
        left: 260,
        background: 'linear-gradient(135deg, rgba(20, 30, 40, 0.9) 0%, rgba(10, 15, 25, 0.95) 100%)',
        border: '2px solid rgba(100, 150, 200, 0.3)',
        borderRadius: 10,
        padding: '10px 14px',
        color: 'white',
        fontFamily: '"Segoe UI", monospace',
        fontSize: 11,
        zIndex: 100
      }}>
        <div style={{ color: 'rgba(150, 200, 255, 0.8)', fontSize: 10, marginBottom: 6, letterSpacing: 1 }}>CONTROLS</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span><span style={{ color: '#66ff66' }}>↑</span> Accelerate <span style={{ opacity: 0.6 }}>|</span> <span style={{ color: '#ffcc00' }}>←→</span> Turn</span>
          <span><span style={{ color: '#66ff66' }}>W/X</span> Up/Down <span style={{ opacity: 0.6 }}>|</span> <span style={{ color: '#ff6666' }}>S</span> Booster</span>
        </div>
      </div>

      {/* 속도 단계 표시 */}
      <div style={{
        position: 'absolute',
        bottom: '18%',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 6,
        zIndex: 100
      }}>
        {[1, 2, 3, 4, 5, 6].map((stage) => (
          <div key={stage} style={{
            width: hud.stage >= stage ? 40 : 30,
            height: 8,
            background: hud.stage >= stage 
              ? `linear-gradient(90deg, #ff6600, #ffcc00)` 
              : 'rgba(100, 100, 100, 0.4)',
            borderRadius: 4,
            transition: 'all 0.3s ease',
            boxShadow: hud.stage >= stage ? '0 0 15px rgba(255, 180, 0, 0.6)' : 'none'
          }} />
        ))}
      </div>

      <div ref={mountRef} style={{ height: '85%', position: 'relative', zIndex: 10 }} />

      <div id="ad-slot" style={{
        position: 'fixed',
        right: 18,
        bottom: '18%',
        width: 320,
        height: 100,
        borderRadius: 14,
        border: '2px dashed rgba(150, 200, 255, 0.35)',
        background: 'linear-gradient(135deg, rgba(10, 18, 35, 0.78) 0%, rgba(5, 10, 25, 0.86) 100%)',
        color: 'rgba(190, 220, 255, 0.9)',
        fontFamily: '"Segoe UI", monospace',
        zIndex: 110,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        letterSpacing: 2,
        boxShadow: '0 0 25px rgba(60, 120, 255, 0.12)',
        userSelect: 'none'
      }}>
        AD PLACEHOLDER (320×100)
      </div>
      
      {/* HUD 패널 */}
      <div style={{ 
        height: '15%', 
        color: 'white', 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center', 
        borderTop: '2px solid rgba(100, 150, 255, 0.3)',
        background: 'linear-gradient(180deg, rgba(10, 20, 40, 0.98) 0%, rgba(5, 10, 25, 0.99) 100%)',
        padding: '10px 0',
        boxShadow: '0 -5px 30px rgba(60, 120, 255, 0.2)'
      }}>
        <div style={{ fontSize: 28, fontWeight: 'bold', marginBottom: 10, letterSpacing: 4, textShadow: '0 0 20px rgba(255, 200, 0, 0.5)' }}>
          🚀 DOGEJET
        </div>
        <div style={{ display: 'flex', gap: 30, alignItems: 'center', fontSize: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'rgba(150, 200, 255, 0.7)' }}>SPEED</span>
            <span style={{ fontFamily: 'monospace', fontSize: 26, fontWeight: 'bold', color: '#66ff66' }}>{hud.speed.toFixed(2)}</span>
            <span style={{ fontSize: 20 }}>{['❶', '❷', '❸', '❹', '❺', '❻'][hud.stage] || ''}</span>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'rgba(150, 200, 255, 0.7)' }}>DISTANCE</span>
            <span style={{ fontFamily: 'monospace', fontSize: 26, fontWeight: 'bold', color: '#ffcc00' }}>{hud.distance.toLocaleString()}</span>
            <span style={{ color: 'rgba(150, 200, 255, 0.7)' }}>m</span>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: hud.booster > 20 ? '#ff6666' : '#888' }}>BOOST</span>
            <span style={{ display: 'inline-block', width: 120, height: 16, background: 'rgba(40, 40, 40, 0.8)', borderRadius: 8, overflow: 'hidden', verticalAlign: 'middle', border: '2px solid rgba(100, 150, 255, 0.3)' }}>
              <span style={{ 
                display: 'block', 
                width: `${hud.booster}%`, 
                height: '100%', 
                background: hud.booster > 20 
                  ? `linear-gradient(90deg, #ff4444, #ff8800, #ffcc00)` 
                  : 'rgba(80, 80, 80, 0.8)',
                transition: 'width 0.2s ease-out',
                boxShadow: hud.booster > 20 ? '0 0 15px rgba(255, 150, 0, 0.6)' : 'none'
              }} />
            </span>
            <span style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 'bold', color: hud.booster > 20 ? '#ff6666' : '#888', minWidth: 35 }}>{hud.booster.toFixed(0)}%</span>
          </div>
        </div>
      </div>
    </main>
  )
}