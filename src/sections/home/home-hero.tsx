// @ts-ignore

import { m, useScroll, Transition } from 'framer-motion';
import { useEffect, useRef, useState, useCallback } from 'react';
// @mui
import { styled, alpha, useTheme, SxProps, Theme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Rating from '@mui/material/Rating';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Grid from '@mui/material/Unstable_Grid2';
import { Typography, List, ListItem, ListItemText } from '@mui/material';
// routes
import { paths } from 'src/routes/paths';
// hooks
import { useResponsive } from 'src/hooks/use-responsive';
// theme
import { textGradient, bgGradient, bgBlur } from 'src/theme/css';
// layouts
import { HEADER } from 'src/layouts/config-layout';
// components
import Iconify from 'src/components/iconify';
import { RouterLink } from 'src/routes/components';
import { MotionContainer, varFade } from 'src/components/animate';
import { TemporalResonatorScene } from 'src/components/three';

// ----------------------------------------------------------------------

const StyledRoot = styled('div')(({ theme }) => ({
  ...bgGradient({
    color: alpha(theme.palette.background.default, theme.palette.mode === 'light' ? 0.9 : 0.94),
    imgUrl: '/assets/background/overlay_3.jpg',
  }),
  width: '100%',
  height: '100vh',
  position: 'relative',
  [theme.breakpoints.up('md')]: {
    top: 0,
    left: 0,
    position: 'fixed',
  },
}));

const StyledWrapper = styled('div')(({ theme }) => ({
  height: '100%',
  width: '100%',
  // overflow: 'hidden',
  position: 'relative',
  [theme.breakpoints.up('md')]: {
    marginTop: HEADER.H_DESKTOP_OFFSET,
  },
}));

const StyledTextGradient = styled(m.h1)(({ theme }) => ({
  ...textGradient(
    `300deg, ${theme.palette.primary.main} 0%, ${theme.palette.warning.main} 25%, ${theme.palette.primary.main} 50%, ${theme.palette.warning.main} 75%, ${theme.palette.primary.main} 100%`
  ),
  padding: 0,
  marginTop: 8,
  lineHeight: 1,
  marginBottom: 24,
  letterSpacing: 8,
  textAlign: 'center',
  backgroundSize: '400%',
  fontSize: `${64 / 16}rem`,
  fontFamily: "'Barlow', sans-serif",
  [theme.breakpoints.up('md')]: {
    fontSize: `${96 / 16}rem`,
  },
}));

const StyledEllipseTop = styled('div')(({ theme }) => ({
  top: -80,
  width: 480,
  right: -80,
  height: 480,
  borderRadius: '50%',
  position: 'absolute',
  filter: 'blur(100px)',
  WebkitFilter: 'blur(100px)',
  backgroundColor: alpha(theme.palette.primary.darker, 0.12),
}));

const StyledEllipseBottom = styled('div')(({ theme }) => ({
  height: 400,
  bottom: -200,
  left: '10%',
  right: '10%',
  borderRadius: '50%',
  position: 'absolute',
  filter: 'blur(100px)',
  WebkitFilter: 'blur(100px)',
  backgroundColor: alpha(theme.palette.primary.darker, 0.12),
}));

type StyledPolygonProps = {
  opacity?: number;
  anchor?: 'left' | 'right';
};

const StyledPolygon = styled('div')<StyledPolygonProps>(
  ({ opacity = 1, anchor = 'left', theme }) => ({
    ...bgBlur({
      opacity,
      color: theme.palette.background.default,
    }),
    zIndex: 9,
    bottom: 0,
    height: 80,
    width: '50%',
    position: 'absolute',
    clipPath: 'polygon(0% 0%, 100% 100%, 0% 100%)',
    ...(anchor === 'left' && {
      left: 0,
      ...(theme.direction === 'rtl' && {
        transform: 'scale(-1, 1)',
      }),
    }),
    ...(anchor === 'right' && {
      right: 0,
      transform: 'scaleX(-1)',
      ...(theme.direction === 'rtl' && {
        transform: 'scaleX(1)',
      }),
    }),
  })
);

// ----------------------------------------------------------------------

export default function HomeHero() {
  const mdUp = useResponsive('up', 'md');

  const theme = useTheme();

  const heroRef = useRef<HTMLDivElement | null>(null);

  const { scrollY } = useScroll();

  const [percent, setPercent] = useState(0.1);

  const isLight = theme.palette.mode === 'light';

  const getScroll = useCallback(() => {
    let heroHeight = 0;

    if (heroRef.current) {
      heroHeight = heroRef.current.offsetHeight;
    }

    scrollY.on('change', (scrollHeight) => {
      const scrollPercent = (scrollHeight * 100) / heroHeight;

      setPercent(Math.floor(scrollPercent)+0.1);
    });
  }, [scrollY]);

  useEffect(() => {
    getScroll();
  }, [getScroll]);

  const transition: Transition = {
    repeatType: 'loop',
    ease: 'linear',
    duration: 60 * 4,
    repeat: Infinity,
  };

  const opacity = 1 - percent / 100;

  const hide = percent > 120;

  const renderDescription = (
    <Stack
      alignItems="center"
      justifyContent="center"
      sx={{
        height: 1,
        mx: 'auto',
        maxWidth: 780,
        opacity: opacity > 0 ? opacity : 1,
        mt: {
          md: `-${HEADER.H_DESKTOP + percent * 2.5}px`,
        },
      }}
    >
      <m.div variants={varFade().in}>
       <Typography variant="h5" sx={{ textAlign: 'center' }}>
          Discover the Universe on Your Terms with
        </Typography>
      </m.div>

      <m.div variants={varFade().in}>
        <StyledTextGradient
          animate={{ backgroundPosition: '200% center' }}
          transition={{
            repeatType: 'reverse',
            ease: 'linear',
            duration: 20,
            repeat: Infinity,
          }}
        >
          𝄆 Shell of Time
        </StyledTextGradient>
      </m.div>

      <m.div variants={varFade().in}>
        <List>
          <ListItem>
            <ListItemText
            sx={{ fontWeight: 'bold', textAlign: 'center' }}
              primary="A Simulation of Collapse and Emergence"
              secondary="A temporal field toy based on the Time Density framework by Kristian Magda & Rikaisho."
            />
          </ListItem>
          {/* <ListItem>
            <ListItemText
            sx={{ fontWeight: 'bold', textAlign: 'center' }}
              primary="Design your universe, test your theories, and reshape reality"
              secondary="Experiment with established physics or break new ground as you create a universe that reflects your imagination."
            />
          </ListItem>
          <ListItem>
            <ListItemText
            sx={{ fontWeight: 'bold', textAlign: 'center' }}
              primary="Your playground for discovery, creation, and cosmic curiosity"
              secondary="Start with known physics or dive into the unknown—every element of the universe is yours to explore and reshape."
            />
          </ListItem> */}
        </List>
      </m.div>

      {/* <m.div variants={varFade().in}>
        <Stack
          spacing={0.75}
          direction="row"
          alignItems="center"
          justifyContent="center"
          sx={{ my: 3 }}
        >
          <Rating readOnly value={4.95} precision={0.1} max={5} />
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            <Box component="strong" sx={{ mr: 0.5, color: 'text.primary' }}>
              4.96/5
            </Box>
            (999+ not fake reviews)
          </Typography>
        </Stack>
      </m.div> */}

      <m.div variants={varFade().in}>
        <Stack spacing={1.5} direction={{ xs: 'column-reverse', sm: 'row' }} sx={{ mb: 10 }}>
          <Stack alignItems="center" spacing={2}>
            <Button
              component={RouterLink}
              href="https://github.com/syqs/time-density"
              target='_blank'
              color="inherit"
              size="large"
              variant="contained"
              startIcon={<Iconify icon="eva:flash-fill" width={24} />}
            >
              Read the Full Theory
            </Button><br/><br/><br/>
            
          </Stack>
        </Stack>
      </m.div>
    </Stack>
  );

  const renderSlides2 = (
    <Stack
      direction="row"
      alignItems="flex-start"
      sx={{
        height: '100%',
        width: '200%',
        position: 'absolute',
        left: 0,
        opacity: opacity > 0 ? opacity : 0,
        }}
    >
      <TemporalResonatorScene  />
    </Stack>
  )

  const renderSlides = (
    <Stack
      direction="row"
      alignItems="flex-start"
      sx={{
        height: '150%',
        position: 'absolute',
        opacity: opacity > 0 ? opacity : 0,
        transform: `skew(${-16 - percent / 24}deg, ${4 - percent / 16}deg)`,
        ...(theme.direction === 'rtl' && {
          transform: `skew(${16 + percent / 24}deg, ${4 + percent / 16}deg)`,
        }),
      }}
    >
      <Stack
        component={m.div}
        variants={varFade().in}
        sx={{
          width: 344,
          position: 'relative',
        }}
      >
        <Box
          component={m.img}
          animate={{ y: ['0%', '100%'] }}
          transition={transition}
          alt={isLight ? 'light_1' : 'dark_1'}
          src={
            isLight
              ? `/assets/images/home/hero/light_1.webp`
              : `/assets/images/home/hero/dark_1.webp`
          }
          sx={{ position: 'absolute', mt: -5 }}
        />
        <Box
          component={m.img}
          animate={{ y: ['-100%', '0%'] }}
          transition={transition}
          alt={isLight ? 'light_1' : 'dark_1'}
          src={
            isLight
              ? `/assets/images/home/hero/light_1.webp`
              : `/assets/images/home/hero/dark_1.webp`
          }
          sx={{ position: 'absolute' }}
        />
      </Stack>

      <Stack
        component={m.div}
        variants={varFade().in}
        sx={{ width: 720, position: 'relative', ml: -5 }}
      >
        <Box
          component={m.img}
          animate={{ y: ['100%', '0%'] }}
          transition={transition}
          alt={isLight ? 'light_2' : 'dark_2'}
          src={
            isLight
              ? `/assets/images/home/hero/light_2.webp`
              : `/assets/images/home/hero/dark_2.webp`
          }
          sx={{ position: 'absolute', mt: -5 }}
        />
        <Box
          component={m.img}
          animate={{ y: ['0%', '-100%'] }}
          transition={transition}
          alt={isLight ? 'light_2' : 'dark_2'}
          src={
            isLight
              ? `/assets/images/home/hero/light_2.webp`
              : `/assets/images/home/hero/dark_2.webp`
          }
          sx={{ position: 'absolute' }}
        />
      </Stack>
    </Stack>
  );

  const renderPolygons = (
    <>
      <StyledPolygon />
      <StyledPolygon anchor="right" opacity={0.48} />
      <StyledPolygon anchor="right" opacity={0.48} sx={{ height: 48, zIndex: 10 }} />
      <StyledPolygon anchor="right" sx={{ zIndex: 11, height: 24 }} />
    </>
  );

  const renderEllipses = (
    <>
      {mdUp && <StyledEllipseTop />}
      <StyledEllipseBottom />
    </>
  );

  return (
    <>
      <StyledRoot
        ref={heroRef}
        sx={{
          
          ...(hide && {
            opacity: 1,
          }),
        }}
        
      >
        <StyledWrapper > 
          <Container component={MotionContainer} sx={{ height: 1, }} style={{width:'100%'}}>
            <Grid container columnSpacing={{ md: 10 }} sx={{ height: 1 }}>
               {mdUp && <Grid md={12}>{renderSlides2}</Grid>}
              <Grid xs={12} md={6}>
                {renderDescription}
              </Grid>

             
            </Grid>
          </Container>

          {/* {renderEllipses} */}
        </StyledWrapper>
      </StyledRoot>

      {/* {mdUp && renderPolygons} */}
      
      {/* <Box sx={{ height: { md: '100vh' }, width:'100%' }} /> */}
    </>
  );
}
