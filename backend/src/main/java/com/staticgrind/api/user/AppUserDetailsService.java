package com.staticgrind.api.user;

import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AppUserDetailsService implements UserDetailsService {

    private final UserRepository users;

    public AppUserDetailsService(UserRepository users) {
        this.users = users;
    }

    @Override
    @Transactional(readOnly = true)
    public UserDetails loadUserByUsername(String email) throws UsernameNotFoundException {
        return users.findByEmailIgnoreCase(email)
                .map(AppUser::from)
                // Deliberately vague: saying "no such account" here would turn
                // the login endpoint into a way to test whether an email is
                // registered. The controller returns the same 401 either way.
                .orElseThrow(() -> new UsernameNotFoundException("Bad credentials"));
    }
}
