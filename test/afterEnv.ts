// Runs after the test framework is set up (RNTL needs Jest's expect).
import { configure } from '@testing-library/react-native';

// Screens wait on the real local database: give findBy/waitFor more than RNTL's 1 s default.
configure({ asyncUtilTimeout: 10_000 });
