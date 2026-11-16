import type { CsrArea, CsrGroup } from '../../domain/courses/types';

// CSRankings(csrankings.org) 연구 분야 27개와 묶음 4개. 이름만 쓴다(순위·논문 수 데이터는 쓰지 않음, CC BY-NC-ND).
export const CSR_GROUP_LABEL: Record<CsrGroup, string> = { ai: 'AI', systems: '시스템', theory: '이론', inter: '융합' };

export const CSR_AREAS: { id: CsrArea; group: CsrGroup; label: string }[] = [
  { id: 'ai', group: 'ai', label: '인공지능' }, // Artificial intelligence
  { id: 'vision', group: 'ai', label: '컴퓨터 비전' }, // Computer vision
  { id: 'mlmining', group: 'ai', label: '머신러닝' }, // Machine learning
  { id: 'nlp', group: 'ai', label: '자연어 처리' }, // Natural language processing
  { id: 'inforet', group: 'ai', label: '웹·정보 검색' }, // The Web & information retrieval
  { id: 'arch', group: 'systems', label: '컴퓨터 구조' }, // Computer architecture
  { id: 'comm', group: 'systems', label: '컴퓨터 네트워크' }, // Computer networks
  { id: 'sec', group: 'systems', label: '컴퓨터 보안' }, // Computer security
  { id: 'mod', group: 'systems', label: '데이터베이스' }, // Databases
  { id: 'da', group: 'systems', label: '설계 자동화' }, // Design automation
  { id: 'bed', group: 'systems', label: '임베디드·실시간 시스템' }, // Embedded & real-time systems
  { id: 'hpc', group: 'systems', label: '고성능 컴퓨팅' }, // High-performance computing
  { id: 'mobile', group: 'systems', label: '모바일 컴퓨팅' }, // Mobile computing
  { id: 'metrics', group: 'systems', label: '측정·성능 분석' }, // Measurement & perf. analysis
  { id: 'ops', group: 'systems', label: '운영체제' }, // Operating systems
  { id: 'plan', group: 'systems', label: '프로그래밍 언어' }, // Programming languages
  { id: 'soft', group: 'systems', label: '소프트웨어공학' }, // Software engineering
  { id: 'act', group: 'theory', label: '알고리즘·복잡도' }, // Algorithms & complexity
  { id: 'crypt', group: 'theory', label: '암호' }, // Cryptography
  { id: 'log', group: 'theory', label: '논리·검증' }, // Logic & verification
  { id: 'bio', group: 'inter', label: '계산생물학' }, // Comp. bio & bioinformatics
  { id: 'graph', group: 'inter', label: '컴퓨터 그래픽스' }, // Computer graphics
  { id: 'csed', group: 'inter', label: '컴퓨터과학 교육' }, // Computer science education
  { id: 'ecom', group: 'inter', label: '경제·계산' }, // Economics & computation
  { id: 'chi', group: 'inter', label: 'HCI' }, // Human-computer interaction
  { id: 'robotics', group: 'inter', label: '로보틱스' }, // Robotics
  { id: 'visualization', group: 'inter', label: '시각화' }, // Visualization
];
